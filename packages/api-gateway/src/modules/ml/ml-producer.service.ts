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
      await this.channel.assertQueue('ml.transcribe', queueOptions);
      await this.channel.assertQueue('ml.embed', queueOptions);

      // Bind queues to exchange
      await this.channel.bindQueue('ml.summarize', this.exchangeName, 'ml.summarize');
      await this.channel.bindQueue('ml.transcribe', this.exchangeName, 'ml.transcribe');
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
      provider?: 'openai' | 'anthropic';
      model?: string;
      maxLength?: number;
      style?: 'brief' | 'detailed' | 'bullets';
    }
  ): Promise<void> {
    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'summarize_llm',
      shareId,
      payload: {
        content,
        options,
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
    language?: string
  ): Promise<void> {
    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'transcribe_whisper',
      shareId,
      payload: {
        mediaUrl,
        language,
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
    text: string,
    dimensions?: number
  ): Promise<void> {
    const task: MLTaskPayload = {
      version: '1.0',
      taskType: 'embed_vectors',
      shareId,
      payload: {
        text,
        dimensions,
      },
      metadata: {
        correlationId: uuidv4(),
        timestamp: Date.now(),
        retryCount: 0,
      },
    };

    await this.publishTask(task);
  }

  private async publishTask(task: MLTaskPayload): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const routingKey = `ml.${task.taskType.split('_')[0]}`;
    
    // Map task types to Celery task names
    const taskNameMap = {
      'summarize_llm': 'summarize_content',
      'transcribe_whisper': 'transcribe_audio',
      'embed_vectors': 'generate_embeddings'
    };
    
    const celeryTaskName = taskNameMap[task.taskType] || task.taskType;
    
    // Celery message format
    const celeryMessage = {
      id: task.metadata.correlationId,
      task: `llm_service.tasks.${celeryTaskName}`,
      args: [],
      kwargs: {
        share_id: task.shareId,
        content: task.payload.content,
        options: task.payload.options
      },
      retries: task.metadata.retryCount,
      eta: null,
      expires: null,
      headers: {
        lang: 'js',
        task: `llm_service.tasks.${celeryTaskName}`,
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