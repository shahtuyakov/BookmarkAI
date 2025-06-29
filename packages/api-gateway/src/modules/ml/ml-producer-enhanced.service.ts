import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../../config/services/config.service';
import { MLMetricsService } from './services/ml-metrics.service';
import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

export interface MLTaskPayload {
  version: '1.0';
  taskType: 'summarize_llm' | 'transcribe_whisper' | 'embed_vectors';
  shareId: string;
  payload: Record<string, any>;
  metadata: {
    correlationId: string;
    timestamp: number;
    retryCount: number;
    traceparent?: string;
  };
}

// Message retry information
interface RetryableMessage {
  task: MLTaskPayload;
  routingKey: string;
  taskName: string;
  attempts: number;
  lastError?: string;
  nextRetryTime: number;
}

// Connection states for better management
enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
}

@Injectable()
export class MLProducerEnhancedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MLProducerEnhancedService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.ConfirmChannel | null = null;
  private readonly exchangeName = 'bookmarkai.ml';
  
  // Connection reliability improvements
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly initialReconnectDelay = 500; // 500ms
  private readonly maxReconnectDelay = 32000; // 32 seconds
  private readonly reconnectJitterFactor = 0.3; // 30% jitter
  private reconnectTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private readonly healthCheckInterval = 30000; // 30 seconds
  private isShuttingDown = false;
  
  // Circuit breaker pattern
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 10;
  private circuitBreakerOpenUntil: Date | null = null;
  private readonly circuitBreakerCooldown = 30000; // 30 seconds
  
  // Message retry queue
  private retryQueue: Map<string, RetryableMessage> = new Map();
  private retryTimer: NodeJS.Timeout | null = null;
  private readonly maxMessageRetries = 3;
  private readonly messageRetryBaseDelay = 1000; // 1 second
  private readonly messageRetryMaxDelay = 10000; // 10 seconds
  
  // Publisher confirm settings
  private readonly publishTimeout = 5000; // 5 seconds
  private pendingConfirms: Map<number, { resolve: Function; reject: Function; timer: NodeJS.Timeout }> = new Map();
  
  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MLMetricsService,
  ) {}

  async onModuleInit() {
    await this.connect();
    this.startHealthCheck();
    this.startRetryProcessor();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    
    // Clear all timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    
    // Clear pending confirms
    for (const [, confirm] of this.pendingConfirms) {
      clearTimeout(confirm.timer);
      confirm.reject(new Error('Service shutting down'));
    }
    this.pendingConfirms.clear();
    
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTING || 
        this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;
    this.metricsService.setConnectionState('CONNECTING');

    try {
      const brokerUrl = this.configService.get<string>(
        'RABBITMQ_URL',
        'amqp://ml:ml_password@localhost:5672/'
      );

      // Build connection options with TLS support
      const connectionOptions: any = {
        heartbeat: parseInt(this.configService.get<string>('RABBITMQ_HEARTBEAT', '60')),
        timeout: parseInt(this.configService.get<string>('RABBITMQ_CONNECTION_TIMEOUT', '10000')),
      };

      // Check if we're using AMQPS (TLS)
      const useSsl = this.configService.get<string>('RABBITMQ_USE_SSL', 'false').toLowerCase() === 'true' || 
                     brokerUrl.startsWith('amqps://');

      if (useSsl) {
        // For cloud services like Amazon MQ, TLS is handled automatically
        // For self-hosted with custom certificates, add certificate options
        const caCert = this.configService.get<string>('RABBITMQ_SSL_CACERT', '');
        const clientCert = this.configService.get<string>('RABBITMQ_SSL_CERTFILE', '');
        const clientKey = this.configService.get<string>('RABBITMQ_SSL_KEYFILE', '');
        const verifyPeer = this.configService.get<string>('RABBITMQ_VERIFY_PEER', 'true').toLowerCase() === 'true';

        if (caCert || clientCert || clientKey || !verifyPeer) {
          const fs = require('fs');
          connectionOptions.socket = {
            cert: clientCert ? fs.readFileSync(clientCert) : undefined,
            key: clientKey ? fs.readFileSync(clientKey) : undefined,
            ca: caCert ? [fs.readFileSync(caCert)] : undefined,
            rejectUnauthorized: verifyPeer,
          };
        }

        this.logger.log('Connecting to RabbitMQ with TLS/SSL enabled');
      }

      this.connection = await amqplib.connect(brokerUrl, connectionOptions);

      // Set up connection event handlers
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        if (!this.isShuttingDown) {
          this.logger.warn('RabbitMQ connection closed unexpectedly');
          this.handleConnectionError();
        }
      });

      this.connection.on('blocked', (reason) => {
        this.logger.warn('RabbitMQ connection blocked:', reason);
        this.metricsService.incrementConnectionError('blocked');
      });

      this.connection.on('unblocked', () => {
        this.logger.log('RabbitMQ connection unblocked');
      });

      // Create confirm channel with proper error handling
      this.channel = await this.connection.createConfirmChannel();
      
      // Set up channel event handlers
      this.channel.on('error', (err) => {
        this.logger.error('RabbitMQ channel error:', err);
        this.handleConnectionError();
      });

      this.channel.on('close', () => {
        if (!this.isShuttingDown) {
          this.logger.warn('RabbitMQ channel closed unexpectedly');
          this.handleConnectionError();
        }
      });

      this.channel.on('return', (msg) => {
        this.logger.warn('Message returned:', {
          routingKey: msg.fields.routingKey,
          replyCode: msg.fields.replyCode,
          replyText: msg.fields.replyText,
        });
        this.metricsService.incrementTasksSent('unknown', 'returned');
      });

      // Set up publisher confirms handlers
      this.channel.on('ack', (data) => {
        const confirm = this.pendingConfirms.get(data.deliveryTag);
        if (confirm) {
          clearTimeout(confirm.timer);
          confirm.resolve();
          this.pendingConfirms.delete(data.deliveryTag);
        }
      });

      this.channel.on('nack', (data) => {
        const confirm = this.pendingConfirms.get(data.deliveryTag);
        if (confirm) {
          clearTimeout(confirm.timer);
          confirm.reject(new Error('Message nacked by broker'));
          this.pendingConfirms.delete(data.deliveryTag);
        }
      });

      // Set prefetch for flow control
      await this.channel.prefetch(100);

      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', {
        durable: true,
      });

      // Declare queues with quorum type
      const queueOptions = {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-delivery-limit': 5,
        },
      };

      await this.channel.assertQueue('ml.summarize', queueOptions);
      await this.channel.assertQueue('ml.summarize_local', queueOptions);
      await this.channel.assertQueue('ml.transcribe', queueOptions);
      await this.channel.assertQueue('ml.transcribe_local', queueOptions);
      await this.channel.assertQueue('ml.embed', queueOptions);

      // Bind queues to exchange
      await this.channel.bindQueue('ml.summarize', this.exchangeName, 'ml.summarize');
      await this.channel.bindQueue('ml.summarize_local', this.exchangeName, 'ml.summarize_local');
      await this.channel.bindQueue('ml.transcribe', this.exchangeName, 'ml.transcribe');
      await this.channel.bindQueue('ml.transcribe_local', this.exchangeName, 'ml.transcribe_local');
      await this.channel.bindQueue('ml.embed', this.exchangeName, 'ml.embed');

      // Reset connection state on successful connection
      this.connectionState = ConnectionState.CONNECTED;
      this.metricsService.setConnectionState('CONNECTED');
      this.reconnectAttempts = 0;
      this.metricsService.setReconnectAttempts(0);
      this.consecutiveFailures = 0;
      this.metricsService.setCircuitBreakerState(false);
      this.circuitBreakerOpenUntil = null;

      this.logger.log('Connected to RabbitMQ and initialized ML queues');
      
      // Process any pending retry messages
      await this.processRetryQueue();
    } catch (error) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.metricsService.setConnectionState('DISCONNECTED');
      this.logger.error('Failed to connect to RabbitMQ:', error);
      this.metricsService.incrementConnectionError(error.message || 'unknown');
      this.handleConnectionError();
      throw error;
    }
  }

  private handleConnectionError(): void {
    if (this.isShuttingDown) {
      return;
    }

    this.connectionState = ConnectionState.DISCONNECTED;
    this.metricsService.setConnectionState('DISCONNECTED');
    this.channel = null;
    this.connection = null;

    // Clear any existing reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Check if we've exceeded max reconnect attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Manual intervention required.');
      this.metricsService.incrementConnectionError('max_attempts_reached');
      return;
    }

    // Calculate exponential backoff with jitter
    const baseDelay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.reconnectJitterFactor * Math.random();
    const delay = Math.floor(baseDelay + jitter);

    this.reconnectAttempts++;
    this.metricsService.setReconnectAttempts(this.reconnectAttempts);
    this.logger.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        // Error is already handled in connect()
      }
    }, delay);
  }

  private async disconnect(): Promise<void> {
    this.connectionState = ConnectionState.CLOSING;
    this.metricsService.setConnectionState('CLOSING');

    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.connectionState = ConnectionState.CLOSED;
      this.metricsService.setConnectionState('CLOSED');
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ:', error);
      this.connectionState = ConnectionState.CLOSED;
      this.metricsService.setConnectionState('CLOSED');
    }
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (this.connectionState === ConnectionState.CONNECTED && this.channel) {
        try {
          // Try to check exchange exists as a health check
          await this.channel.checkExchange(this.exchangeName);
        } catch (error) {
          this.logger.error('Health check failed:', error);
          this.handleConnectionError();
        }
      }
    }, this.healthCheckInterval);
  }

  private startRetryProcessor(): void {
    this.retryTimer = setInterval(async () => {
      await this.processRetryQueue();
    }, 1000); // Check every second
  }

  private async processRetryQueue(): Promise<void> {
    if (this.connectionState !== ConnectionState.CONNECTED || !this.channel) {
      return;
    }

    const now = Date.now();
    const messagesToRetry: string[] = [];

    // Find messages that are ready to retry
    for (const [id, message] of this.retryQueue) {
      if (message.nextRetryTime <= now) {
        messagesToRetry.push(id);
      }
    }

    // Process each message
    for (const id of messagesToRetry) {
      const message = this.retryQueue.get(id);
      if (!message) continue;

      try {
        await this.publishTaskInternal(message.task, message.taskName, message.routingKey);
        this.retryQueue.delete(id);
        this.logger.log(`Successfully retried message ${id} after ${message.attempts} attempts`);
        this.metricsService.incrementTaskRetry(message.task.taskType);
      } catch (error) {
        message.attempts++;
        message.lastError = error.message;

        if (message.attempts >= this.maxMessageRetries) {
          this.logger.error(`Message ${id} failed after ${message.attempts} attempts. Moving to DLQ.`, {
            task: message.task,
            error: error.message,
          });
          this.retryQueue.delete(id);
          this.metricsService.incrementTasksSent(message.task.taskType, 'dlq');
          // TODO: Implement actual DLQ publishing
        } else {
          // Calculate next retry time with exponential backoff
          const retryDelay = Math.min(
            this.messageRetryBaseDelay * Math.pow(2, message.attempts - 1),
            this.messageRetryMaxDelay
          );
          message.nextRetryTime = now + retryDelay;
          this.logger.warn(`Message ${id} retry ${message.attempts} failed. Next retry in ${retryDelay}ms`);
        }
      }
    }
  }

  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpenUntil) {
      return false;
    }
    
    if (new Date() > this.circuitBreakerOpenUntil) {
      this.circuitBreakerOpenUntil = null;
      this.consecutiveFailures = 0;
      this.metricsService.setCircuitBreakerState(false);
      this.logger.log('Circuit breaker closed');
      return false;
    }
    
    return true;
  }

  private openCircuitBreaker(): void {
    this.circuitBreakerOpenUntil = new Date(Date.now() + this.circuitBreakerCooldown);
    this.metricsService.incrementCircuitBreakerTrips();
    this.metricsService.setCircuitBreakerState(true);
    this.logger.warn(`Circuit breaker opened until ${this.circuitBreakerOpenUntil.toISOString()}`);
  }

  private async ensureConnected(): Promise<void> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker is open. Service is temporarily unavailable.');
    }

    // Check connection state
    if (this.connectionState !== ConnectionState.CONNECTED || !this.channel) {
      // Try to reconnect if not already connecting
      if (this.connectionState !== ConnectionState.CONNECTING) {
        await this.connect();
      }
      
      // If still not connected after attempt, throw error
      if (this.connectionState !== ConnectionState.CONNECTED || !this.channel) {
        throw new Error('RabbitMQ is not connected');
      }
    }
  }

  private async waitForConfirmWithTimeout(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Publisher confirm timeout after ${timeout}ms`));
      }, timeout);

      this.channel!.waitForConfirms((err) => {
        clearTimeout(timer);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async publishSummarizationTask(
    shareId: string,
    content: {
      text: string;
      title?: string;
      url?: string;
      contentType?: string;
    },
    options?: {
      provider?: 'openai' | 'anthropic' | 'local';
      model?: string;
      maxLength?: number;
      style?: 'brief' | 'detailed' | 'bullets';
      backend?: 'api' | 'local';
    }
  ): Promise<void> {
    // Determine backend based on provider or environment preference
    const backend = options?.backend || 
      (options?.provider === 'local' ? 'local' : 'api') ||
      (this.configService.get<string>('PREFERRED_LLM_BACKEND', 'api') as 'api' | 'local');
    
    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'summarize_llm',
      shareId,
      payload: {
        content,
        options: {
          ...options,
          backend,
        },
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        retryCount: 0,
        // TODO: Add W3C trace context from current span
      },
    };

    await this.publishTask(task);
  }

  async publishTranscriptionTask(
    shareId: string,
    mediaUrl: string,
    options?: {
      language?: string;
      backend?: 'api' | 'local';
      normalize?: boolean;
      prompt?: string;
    }
  ): Promise<void> {
    // Determine backend based on environment or load
    const backend = options?.backend || 
      (this.configService.get<string>('PREFERRED_STT', 'api') as 'api' | 'local');
    
    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'transcribe_whisper',
      shareId,
      payload: {
        content: {
          mediaUrl,
        },
        options: {
          language: options?.language,
          backend,
          normalize: options?.normalize ?? true,
          prompt: options?.prompt,
        },
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    await this.publishTask(task);
  }

  async publishEmbeddingTask(
    shareId: string,
    content: {
      text: string;
      type?: 'caption' | 'transcript' | 'article' | 'comment' | 'tweet';
      metadata?: Record<string, any>;
    },
    options?: {
      embeddingType?: 'content' | 'summary' | 'composite';
      forceModel?: 'text-embedding-3-small' | 'text-embedding-3-large';
      chunkStrategy?: 'none' | 'transcript' | 'paragraph' | 'sentence' | 'fixed';
      backend?: 'api' | 'local';
    }
  ): Promise<void> {
    // Determine backend (default to API for now)
    const backend = options?.backend || 
      (this.configService.get<string>('PREFERRED_EMBEDDING_BACKEND', 'api') as 'api' | 'local');

    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'embed_vectors',
      shareId,
      payload: {
        content: {
          text: content.text,
          type: content.type || 'caption',
          metadata: content.metadata || {},
        },
        options: {
          embedding_type: options?.embeddingType || 'content',
          force_model: options?.forceModel,
          chunk_strategy: options?.chunkStrategy,
          backend,
        },
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    await this.publishTask(task);
  }

  async publishBatchEmbeddingTask(
    tasks: Array<{
      shareId: string;
      content: {
        text: string;
        type?: 'caption' | 'transcript' | 'article' | 'comment' | 'tweet';
        metadata?: Record<string, any>;
      };
      options?: {
        embeddingType?: 'content' | 'summary' | 'composite';
        forceModel?: 'text-embedding-3-small' | 'text-embedding-3-large';
        chunkStrategy?: 'none' | 'transcript' | 'paragraph' | 'sentence' | 'fixed';
      };
    }>
  ): Promise<void> {
    // Convert to format expected by the batch task
    const batchPayload = tasks.map(t => ({
      share_id: t.shareId,
      content: {
        text: t.content.text,
        type: t.content.type || 'caption',
        metadata: t.content.metadata || {},
      },
      options: {
        embedding_type: t.options?.embeddingType || 'content',
        force_model: t.options?.forceModel,
        chunk_strategy: t.options?.chunkStrategy,
      },
    }));

    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'embed_vectors',
      shareId: 'batch-' + uuidv4(), // Special ID for batch tasks
      payload: {
        tasks: batchPayload,
        isBatch: true,
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    // Override the task name for batch processing
    await this.publishTask(task, 'vector_service.tasks.generate_embeddings_batch');
  }

  private async publishTask(task: MLTaskPayload, overrideTaskName?: string): Promise<void> {
    // Determine routing key based on task type and backend
    let routingKey = `ml.${task.taskType.split('_')[0]}`;
    if (task.taskType === 'transcribe_whisper' && 
        task.payload.options?.backend === 'local') {
      routingKey = 'ml.transcribe_local';
    }
    if (task.taskType === 'summarize_llm' && 
        task.payload.options?.backend === 'local') {
      routingKey = 'ml.summarize_local';
    }
    
    // Map task types to Celery task names
    const taskNameMap = {
      'summarize_llm': 'llm_service.tasks.summarize_content',
      'transcribe_whisper': 'whisper.tasks.transcribe_api',
      'embed_vectors': 'vector_service.tasks.generate_embeddings'
    };
    
    // Use override task name if provided (for batch tasks)
    let celeryTaskName = overrideTaskName || taskNameMap[task.taskType] || task.taskType;
    if (task.taskType === 'transcribe_whisper' && 
        task.payload.options?.backend === 'local') {
      celeryTaskName = 'whisper.tasks.transcribe_local';
    }
    // For summarization, check if we should use local queue
    if (task.taskType === 'summarize_llm' && 
        task.payload.options?.backend === 'local') {
      celeryTaskName = 'llm_service.tasks.summarize_content_local';
    }

    try {
      await this.publishTaskInternal(task, celeryTaskName, routingKey);
    } catch (error) {
      // Add to retry queue if it's a temporary failure
      if (this.shouldRetryMessage(error)) {
        const retryId = `${task.shareId}-${task.taskType}-${task.metadata.correlationId}`;
        this.retryQueue.set(retryId, {
          task,
          routingKey,
          taskName: celeryTaskName,
          attempts: 1,
          lastError: error.message,
          nextRetryTime: Date.now() + this.messageRetryBaseDelay,
        });
        this.logger.warn(`Added message to retry queue: ${retryId}`);
        this.metricsService.incrementTasksSent(task.taskType, 'queued_for_retry');
      } else {
        throw error;
      }
    }
  }

  private async publishTaskInternal(
    task: MLTaskPayload, 
    celeryTaskName: string, 
    routingKey: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.ensureConnected();
    } catch (error) {
      this.metricsService.incrementTasksSent(task.taskType, 'circuit_breaker_open');
      throw error;
    }
    
    // Celery message format
    const celeryMessage = {
      id: task.metadata.correlationId,
      task: celeryTaskName,
      args: [],
      kwargs: task.payload.isBatch ? {
        tasks: task.payload.tasks  // For batch tasks
      } : {
        share_id: task.shareId,
        content: task.payload.content,
        options: task.payload.options
      },
      retries: task.metadata.retryCount,
      eta: null,
      expires: null,
      headers: {
        lang: 'js',
        task: celeryTaskName,
        id: task.metadata.correlationId,
        retries: task.metadata.retryCount,
        root_id: task.metadata.correlationId,
        parent_id: null,
        group: null
      },
      priority: 0,
      reply_to: null,
      correlation_id: task.metadata.correlationId
    };

    const messageBuffer = Buffer.from(JSON.stringify(celeryMessage));
    
    // Record message size
    this.metricsService.recordMessageSize(task.taskType, messageBuffer.length);
    
    // Track retries
    if (task.metadata.retryCount > 0) {
      this.metricsService.incrementTaskRetry(task.taskType);
    }
    
    try {
      // Publish with mandatory flag and proper confirms
      const published = this.channel!.publish(
        this.exchangeName,
        routingKey,
        messageBuffer,
        {
          persistent: true,
          mandatory: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          headers: {
            'traceparent': task.metadata.traceparent,
          },
        }
      );

      if (!published) {
        throw new Error('Channel flow control prevented publishing');
      }

      // Wait for broker confirmation with timeout
      await this.waitForConfirmWithTimeout(this.publishTimeout);
      
      // Reset consecutive failures on success
      this.consecutiveFailures = 0;
      
      // Record success metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.recordTaskPublishDuration(task.taskType, 'success', durationSeconds);
      this.metricsService.incrementTasksSent(task.taskType, 'success');
      
      this.logger.log(`Published ${task.taskType} task for share ${task.shareId}`);
    } catch (error) {
      this.consecutiveFailures++;
      
      // Check if we should open circuit breaker
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.openCircuitBreaker();
      }
      
      this.logger.error(`Failed to publish task: ${error.message}`, error);
      
      // Record failure metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.recordTaskPublishDuration(task.taskType, 'failure', durationSeconds);
      this.metricsService.incrementTasksSent(task.taskType, 'failure');
      
      // Handle connection errors specifically
      if (error.message?.includes('Channel closed') || 
          error.message?.includes('Connection closed') ||
          error.message?.includes('Channel flow control')) {
        this.handleConnectionError();
      }
      
      throw error;
    }
  }

  private shouldRetryMessage(error: any): boolean {
    // Retry on temporary failures
    const retryableErrors = [
      'Channel closed',
      'Connection closed',
      'Channel flow control',
      'timeout',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
    ];
    
    const errorMessage = error.message || '';
    return retryableErrors.some(e => errorMessage.toLowerCase().includes(e.toLowerCase()));
  }

  async getMLResult(shareId: string, taskType: string): Promise<any> {
    // This would query the ml_results table
    // For now, we'll leave this as a placeholder
    // The actual implementation would use the database service
    throw new Error('Not implemented - use database service to query ml_results');
  }

  // Health check method for monitoring
  async isHealthy(): Promise<boolean> {
    return this.connectionState === ConnectionState.CONNECTED && 
           !this.isCircuitBreakerOpen() &&
           this.channel !== null &&
           this.connection !== null;
  }

  // Get current status for debugging
  getStatus(): {
    connectionState: string;
    reconnectAttempts: number;
    consecutiveFailures: number;
    circuitBreakerOpen: boolean;
    retryQueueSize: number;
    pendingConfirms: number;
  } {
    // Update metrics gauges whenever status is requested
    this.metricsService.setConnectionState(this.connectionState);
    this.metricsService.setReconnectAttempts(this.reconnectAttempts);
    this.metricsService.setCircuitBreakerState(this.isCircuitBreakerOpen());
    
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
      retryQueueSize: this.retryQueue.size,
      pendingConfirms: this.pendingConfirms.size,
    };
  }
}