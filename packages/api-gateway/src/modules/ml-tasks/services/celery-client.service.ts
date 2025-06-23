import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

interface CeleryMessage {
  id: string;
  task: string;
  args: any[];
  kwargs: Record<string, any>;
  retries: number;
  eta: string | null;
  expires: string | null;
  utc: boolean;
  callbacks: null;
  errbacks: null;
  chord: null;
  group: null;
  parent_id: string | null;
  root_id: string;
}

@Injectable()
export class CeleryClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CeleryClientService.name);
  private connection: any = null;
  private channel: amqplib.Channel | null = null;
  private readonly exchangeName = 'ml.tasks';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const config = this.configService.get('mlTasks.rabbitmq');
      const amqpUrl = `amqp://${config.user}:${config.pass}@${config.host}:${config.port}${config.vhost}`;

      this.connection = await amqplib.connect(amqpUrl);
      this.channel = await (this.connection as any).createChannel();

      // Declare exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', {
        durable: true,
      });

      this.logger.log('Connected to RabbitMQ for Celery tasks');
      this.logger.log(`Exchange: ${this.exchangeName}`);
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
    }
  }

  async sendTask(
    taskName: string,
    args: any[],
    routingKey: string,
    correlationId?: string,
  ): Promise<string> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const taskId = uuidv4();
    const message: CeleryMessage = {
      id: taskId,
      task: taskName,
      args: args,
      kwargs: {},
      retries: 0,
      eta: null,
      expires: null,
      utc: true,
      callbacks: null,
      errbacks: null,
      chord: null,
      group: null,
      parent_id: null,
      root_id: taskId,
    };

    const headers = {
      lang: 'py',
      task: taskName,
      id: taskId,
      root_id: taskId,
      parent_id: null,
      group: null,
      meth: null,
      shadow: null,
      eta: null,
      expires: null,
      retries: 0,
      timelimit: [null, null],
      argsrepr: '()',
      kwargsrepr: '{}',
      origin: 'api-gateway@nodejs',
      correlation_id: correlationId,
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));
    const options: amqplib.Options.Publish = {
      persistent: true,
      deliveryMode: 2,
      priority: 0,
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      headers,
      correlationId: correlationId,
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

      this.logger.log(`Published Celery task ${taskName} with ID ${taskId}`);
      this.logger.debug(`Task details: routing_key=${routingKey}, args=${JSON.stringify(args)}`);
      return taskId;
    } catch (error) {
      this.logger.error(`Failed to publish Celery task ${taskName}`, error);
      throw error;
    }
  }
}