import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '../../config/services/config.service';
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

// Connection states for better management
enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  CLOSING = 'CLOSING',
  CLOSED = 'CLOSED',
}

@Injectable()
export class MLProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MLProducerService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.ConfirmChannel | null = null;
  private readonly exchangeName = 'bookmarkai.ml';
  
  // Connection reliability improvements
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly initialReconnectDelay = 1000; // 1 second
  private readonly maxReconnectDelay = 60000; // 60 seconds
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  
  // Circuit breaker pattern
  private consecutiveFailures = 0;
  private readonly maxConsecutiveFailures = 5;
  private circuitBreakerOpenUntil: Date | null = null;
  private readonly circuitBreakerCooldown = 30000; // 30 seconds
  
  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTING || 
        this.connectionState === ConnectionState.CONNECTED) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;

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

      // Reset reconnection state on successful connection
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      this.circuitBreakerOpenUntil = null;

      this.logger.log('Connected to RabbitMQ and initialized ML queues');
    } catch (error) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.logger.error('Failed to connect to RabbitMQ:', error);
      this.handleConnectionError();
      throw error;
    }
  }

  private handleConnectionError(): void {
    if (this.isShuttingDown) {
      return;
    }

    this.connectionState = ConnectionState.DISCONNECTED;
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
      return;
    }

    // Calculate exponential backoff delay
    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
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
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ:', error);
      this.connectionState = ConnectionState.CLOSED;
    }
  }

  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpenUntil) {
      return false;
    }
    
    if (new Date() > this.circuitBreakerOpenUntil) {
      this.circuitBreakerOpenUntil = null;
      this.consecutiveFailures = 0;
      return false;
    }
    
    return true;
  }

  private openCircuitBreaker(): void {
    this.circuitBreakerOpenUntil = new Date(Date.now() + this.circuitBreakerCooldown);
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
    await this.ensureConnected();

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
    
    try {
      // Publish with mandatory flag and wait for confirmation
      await new Promise<void>((resolve, reject) => {
        this.channel!.publish(
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
          },
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Wait for broker confirmation
      await this.channel!.waitForConfirms();
      
      // Reset consecutive failures on success
      this.consecutiveFailures = 0;
      
      this.logger.log(`Published ${task.taskType} task for share ${task.shareId}`);
    } catch (error) {
      this.consecutiveFailures++;
      
      // Check if we should open circuit breaker
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.openCircuitBreaker();
      }
      
      this.logger.error(`Failed to publish task: ${error.message}`, error);
      
      // Handle connection errors specifically
      if (error.message?.includes('Channel closed') || 
          error.message?.includes('Connection closed')) {
        this.handleConnectionError();
      }
      
      throw error;
    }
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
  } {
    return {
      connectionState: this.connectionState,
      reconnectAttempts: this.reconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
    };
  }
}