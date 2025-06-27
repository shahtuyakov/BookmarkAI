import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class MLProducerService {
  private readonly logger = new Logger(MLProducerService.name);
  private connection: amqplib.ChannelModel | null = null;
  private channel: amqplib.ConfirmChannel | null = null;
  private readonly exchangeName = 'bookmarkai.ml';
  
  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      const brokerUrl = this.configService.get<string>(
        'RABBITMQ_URL',
        'amqp://ml:ml_password@localhost:5672/'
      );

      this.connection = await amqplib.connect(brokerUrl, {
        heartbeat: 60,
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed, attempting to reconnect...');
        setTimeout(() => this.connect(), 5000);
      });

      this.channel = await this.connection.createConfirmChannel();

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

      this.logger.log('Connected to RabbitMQ and initialized ML queues');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  private async disconnect() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ:', error);
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
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

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
      // Publish with mandatory flag
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

      if (published) {
        // Wait for confirmation if using publisher confirms
        await this.channel!.waitForConfirms();
        this.logger.log(`Published ${task.taskType} task for share ${task.shareId}`);
      } else {
        throw new Error('Failed to publish message to queue');
      }
    } catch (error) {
      this.logger.error(`Failed to publish task: ${error.message}`, error);
      throw error;
    }
  }

  async getMLResult(shareId: string, taskType: string): Promise<any> {
    // This would query the ml_results table
    // For now, we'll leave this as a placeholder
    // The actual implementation would use the database service
    throw new Error('Not implemented - use database service to query ml_results');
  }
}