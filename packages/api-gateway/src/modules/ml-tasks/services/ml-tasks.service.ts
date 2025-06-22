import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';
import {
  EmbedPayload,
  SummarizePayload,
  TaskMessage,
  TranscribePayload,
} from '../interfaces/task-message.interface';

@Injectable()
export class MlTasksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MlTasksService.name);
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly exchangeName: string;
  private readonly exchangeType: string;

  constructor(private readonly configService: ConfigService) {
    const mlConfig = this.configService.get('mlTasks');
    this.exchangeName = mlConfig.exchange.name;
    this.exchangeType = mlConfig.exchange.type;
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const config = this.configService.get('mlTasks.rabbitmq');
      const url = `amqp://${config.user}:${config.pass}@${config.host}:${config.port}${config.vhost}`;

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, this.exchangeType, {
        durable: true,
      });

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        // Attempt reconnection after delay
        setTimeout(() => this.reconnect(), 5000);
      });

      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    this.logger.log('Attempting to reconnect to RabbitMQ...');
    try {
      await this.disconnect();
      await this.connect();
    } catch (error) {
      this.logger.error('Failed to reconnect', error);
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
    } catch (error) {
      this.logger.error('Error during disconnect', error);
    }
  }

  async publishTranscriptionTask(
    shareId: string,
    payload: TranscribePayload,
    correlationId?: string,
  ): Promise<void> {
    const message: TaskMessage = {
      version: '1.0',
      taskType: 'transcribe_whisper',
      shareId,
      payload,
      metadata: {
        correlationId: correlationId || randomUUID(),
        timestamp: Date.now(),
        retryCount: 0,
        traceparent: this.getTraceContext(),
      },
    };

    await this.publishTask(message, 'transcribe_whisper');
  }

  async publishSummarizationTask(
    shareId: string,
    payload: SummarizePayload,
    correlationId?: string,
  ): Promise<void> {
    const message: TaskMessage = {
      version: '1.0',
      taskType: 'summarize_llm',
      shareId,
      payload,
      metadata: {
        correlationId: correlationId || randomUUID(),
        timestamp: Date.now(),
        retryCount: 0,
        traceparent: this.getTraceContext(),
      },
    };

    await this.publishTask(message, 'summarize_llm');
  }

  async publishEmbeddingTask(
    shareId: string,
    payload: EmbedPayload,
    correlationId?: string,
  ): Promise<void> {
    const message: TaskMessage = {
      version: '1.0',
      taskType: 'embed_vectors',
      shareId,
      payload,
      metadata: {
        correlationId: correlationId || randomUUID(),
        timestamp: Date.now(),
        retryCount: 0,
        traceparent: this.getTraceContext(),
      },
    };

    await this.publishTask(message, 'embed_vectors');
  }

  private async publishTask(message: TaskMessage, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const messageBuffer = Buffer.from(JSON.stringify(message));
    const options: amqp.Options.Publish = {
      persistent: true,
      priority: this.configService.get('mlTasks.taskDefaults.priority'),
      correlationId: message.metadata.correlationId,
      timestamp: message.metadata.timestamp,
      headers: {
        'x-task-type': message.taskType,
        'x-share-id': message.shareId,
        ...(message.metadata.traceparent && {
          traceparent: message.metadata.traceparent,
        }),
      },
    };

    try {
      const published = this.channel.publish(
        this.exchangeName,
        routingKey,
        messageBuffer,
        options,
      );

      if (!published) {
        throw new Error('Failed to publish message - channel buffer full');
      }

      this.logger.debug(`Published ${message.taskType} task for share ${message.shareId}`);
    } catch (error) {
      this.logger.error(`Failed to publish task ${message.taskType}`, error);
      throw error;
    }
  }

  private getTraceContext(): string | undefined {
    // TODO: Integrate with OpenTelemetry to get current trace context
    // For now, return undefined
    return undefined;
  }
}