import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  EmbedPayload,
  SummarizePayload,
  TranscribePayload,
} from '../interfaces/task-message.interface';
import { CeleryClientService } from './celery-client.service';

@Injectable()
export class MlTasksService {
  private readonly logger = new Logger(MlTasksService.name);

  constructor(
    private readonly configService: ConfigService,
    private celeryClient: CeleryClientService,
  ) {}

  async publishTranscriptionTask(
    shareId: string,
    payload: TranscribePayload,
    correlationId?: string,
  ): Promise<void> {
    const taskCorrelationId = correlationId || randomUUID();
    const metadata = {
      correlationId: taskCorrelationId,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      traceparent: this.getTraceContext(),
    };

    await this.celeryClient.sendTask(
      'whisper_service.tasks.transcribe_whisper',
      [shareId, payload, metadata],
      'transcribe_whisper',
      taskCorrelationId,
    );
    
    this.logger.debug(`Submitted transcribe task for share ${shareId}`);
  }

  async publishSummarizationTask(
    shareId: string,
    payload: SummarizePayload,
    correlationId?: string,
  ): Promise<void> {
    const taskCorrelationId = correlationId || randomUUID();
    const metadata = {
      correlationId: taskCorrelationId,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      traceparent: this.getTraceContext(),
    };

    await this.celeryClient.sendTask(
      'llm_service.tasks.summarize_llm',
      [shareId, payload, metadata],
      'summarize_llm',
      taskCorrelationId,
    );
    
    this.logger.debug(`Submitted summarize task for share ${shareId}`);
  }

  async publishEmbeddingTask(
    shareId: string,
    payload: EmbedPayload,
    correlationId?: string,
  ): Promise<void> {
    const taskCorrelationId = correlationId || randomUUID();
    const metadata = {
      correlationId: taskCorrelationId,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      traceparent: this.getTraceContext(),
    };

    await this.celeryClient.sendTask(
      'vector_service.tasks.embed_vectors',
      [shareId, payload, metadata],
      'embed_vectors',
      taskCorrelationId,
    );
    
    this.logger.debug(`Submitted embed task for share ${shareId}`);
  }

  private getTraceContext(): string | undefined {
    // TODO: Integrate with OpenTelemetry to get current trace context
    // For now, return undefined
    return undefined;
  }
}