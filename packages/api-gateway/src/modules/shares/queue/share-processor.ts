import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { ConfigService } from '../../../config/services/config.service';
import { shares } from '../../../db/schema/shares';
import { SHARE_QUEUE } from './share-queue.constants';
import { eq } from 'drizzle-orm';
import { ShareStatus } from '../constants/share-status.enum';
import { ContentFetcherRegistry } from '../fetchers/content-fetcher.registry';
import { FetcherError } from '../fetchers/interfaces/fetcher-error.interface';
import { Platform } from '../constants/platform.enum';
import { MlTasksService } from '../../ml-tasks/services/ml-tasks.service';

/**
 * Processor for share background tasks
 * Note: MVP implementation for Phase 1. Will be expanded in Phase 2 with platform-specific processing.
 */
@Processor(SHARE_QUEUE.NAME)
export class ShareProcessor {
  private readonly logger = new Logger(ShareProcessor.name);
  private readonly processingDelayMs: number;

  constructor(
    private readonly db: DrizzleService,
    private readonly configService: ConfigService,
    private readonly fetcherRegistry: ContentFetcherRegistry,
    private readonly mlTasksService: MlTasksService,
  ) {
    // Get configuration with defaults
    this.processingDelayMs = this.configService.get('WORKER_DELAY_MS', 5000);
  }

  /**
   * Process a share
   * In Phase 1, this simulates processing with a delay
   * In Phase 2+, this will integrate with fetchers and ML services
   */
  @Process({
    name: SHARE_QUEUE.JOBS.PROCESS,
    concurrency: 3,
  })
  async processShare(job: Job<{ shareId: string }>) {
    this.logger.log(`Processing share with ID: ${job.data.shareId}`);
    
    try {
      // Fetch the share data
      const [share] = await this.db.database
        .select()
        .from(shares)
        .where(eq(shares.id, job.data.shareId))
        .limit(1);
      
      if (!share) {
        throw new Error(`Share with ID ${job.data.shareId} not found`);
      }
      
      // Log URL being processed (key requirement from ADR)
      this.logger.log(`Processing URL: ${share.url}`);
      
      // Share is already set to "processing" status from the controller,
      // but we'll update the timestamp to mark when worker picked it up
      await this.updateShareStatus(job.data.shareId, ShareStatus.PROCESSING);
      
      // Phase 2: Fetch content using the fetcher registry
      try {
        await this.updateShareStatus(job.data.shareId, ShareStatus.FETCHING);
        
        const fetcher = this.fetcherRegistry.getFetcher(share.platform as Platform);
        const fetchResult = await fetcher.fetchContent({
          url: share.url,
          shareId: share.id,
          userId: share.userId,
        });
        
        // Store the fetched metadata (Task 2.8 will implement this)
        await this.storeMetadata(job.data.shareId, fetchResult);
        
        // Queue media download if needed (Task 2.7 will implement this)
        if (fetchResult.media?.url) {
          await this.queueMediaDownload(job.data.shareId, fetchResult.media);
          
          // Queue ML tasks for media processing
          await this.queueMLTasks(job.data.shareId, fetchResult);
        }
        
        // Update status to "done"
        await this.updateShareStatus(job.data.shareId, ShareStatus.DONE);
      } catch (fetchError) {
        if (fetchError instanceof FetcherError) {
          this.logger.error(
            `Fetcher error for share ${job.data.shareId}: ${fetchError.message} (Code: ${fetchError.code})`,
            fetchError.stack
          );
          
          // If it's not retryable, mark as error
          if (!fetchError.isRetryable()) {
            await this.updateShareStatus(job.data.shareId, ShareStatus.ERROR);
            // Don't re-throw for non-retryable errors
            return { 
              id: share.id, 
              url: share.url, 
              status: ShareStatus.ERROR,
              error: fetchError.message,
              errorCode: fetchError.code
            };
          }
        }
        
        // Re-throw to trigger Bull's retry mechanism
        throw fetchError;
      }
      
      this.logger.log(`Successfully processed share ${job.data.shareId}`);
      
      // Return result for monitoring/visibility
      return { 
        id: share.id, 
        url: share.url, 
        status: ShareStatus.DONE,
        processingTimeMs: this.processingDelayMs
      };
    } catch (error) {
      this.logger.error(`Error processing share ${job.data.shareId}: ${error.message}`, error.stack);
      
      // Handle different error types
      if (error.code && typeof error.code === 'string') {
        // Database errors
        await this.handleDatabaseError(job.data.shareId, error);
      } else if (error.name === 'TimeoutError') {
        // Timeout errors
        this.logger.error(`Processing timed out for share ${job.data.shareId}`);
        await this.updateShareStatus(job.data.shareId, ShareStatus.ERROR);
      } else {
        // Generic error handling
        try {
          await this.updateShareStatus(job.data.shareId, ShareStatus.ERROR);
        } catch (updateError) {
          this.logger.error(`Failed to update share status to error: ${updateError.message}`);
        }
      }
      
      // Re-throw to trigger Bull's retry mechanism
      throw error;
    }
  }

  /**
   * Helper to update share status
   */
  private async updateShareStatus(shareId: string, status: ShareStatus): Promise<void> {
    try {
      await this.db.database
        .update(shares)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(shares.id, shareId));
      
      this.logger.log(`Updated share ${shareId} status to "${status}"`);
    } catch (error) {
      this.logger.error(`Failed to update share ${shareId} status to ${status}: ${error.message}`);
      throw error;  // Rethrow to be handled by the caller
    }
  }

  /**
   * Helper to handle database errors
   */
  private async handleDatabaseError(shareId: string, error: any): Promise<void> {
    this.logger.error(`Database error for share ${shareId}: ${error.message} (Code: ${error.code})`);
    
    try {
      await this.updateShareStatus(shareId, ShareStatus.ERROR);
    } catch (updateError) {
      this.logger.error(`Failed to update share status after database error: ${updateError.message}`);
    }
  }

  /**
   * Helper to create a delay (Promise-based setTimeout)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store fetched metadata in the database
   * Task 2.8 will implement the full storage logic
   */
  private async storeMetadata(shareId: string, fetchResult: any): Promise<void> {
    this.logger.debug(`Storing metadata for share ${shareId}`);
    
    try {
      await this.db.database
        .update(shares)
        .set({
          title: fetchResult.content?.text || fetchResult.content?.description,
          description: fetchResult.content?.description,
          author: fetchResult.metadata?.author,
          thumbnailUrl: fetchResult.media?.thumbnailUrl,
          mediaUrl: fetchResult.media?.url,
          mediaType: fetchResult.media?.type,
          platformData: fetchResult.platformData,
          updatedAt: new Date(),
        })
        .where(eq(shares.id, shareId));
      
      this.logger.log(`Successfully stored metadata for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to store metadata for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Queue media download job
   * Task 2.7 will implement the media download queue
   */
  private async queueMediaDownload(shareId: string, media: any): Promise<void> {
    this.logger.debug(
      `[Task 2.7 Placeholder] Queueing media download for share ${shareId}: ${media.type} - ${media.url}`
    );
    // Task 2.7 will implement this with a separate media download queue
  }

  /**
   * Queue ML tasks for content processing
   * Dispatches transcription, summarization, and embedding tasks
   */
  private async queueMLTasks(shareId: string, fetchResult: any): Promise<void> {
    try {
      const correlationId = `share-${shareId}-${Date.now()}`;

      // Queue transcription if video/audio content
      if (fetchResult.media?.type === 'video' || fetchResult.media?.type === 'audio') {
        await this.mlTasksService.publishTranscriptionTask(
          shareId,
          {
            mediaUrl: fetchResult.media.url,
            language: null, // Auto-detect
          },
          correlationId,
        );
        this.logger.log(`Queued transcription task for share ${shareId}`);
      }

      // Queue summarization if text content exists
      if (fetchResult.content?.text || fetchResult.content?.description) {
        const textToSummarize = fetchResult.content.text || fetchResult.content.description;
        await this.mlTasksService.publishSummarizationTask(
          shareId,
          {
            text: textToSummarize,
            maxTokens: 150,
            style: 'concise',
          },
          correlationId,
        );
        this.logger.log(`Queued summarization task for share ${shareId}`);
      }

      // Queue embedding generation for search
      const embeddingText = [
        fetchResult.content?.text,
        fetchResult.content?.description,
        fetchResult.metadata?.title,
      ]
        .filter(Boolean)
        .join(' ');

      if (embeddingText) {
        await this.mlTasksService.publishEmbeddingTask(
          shareId,
          {
            text: embeddingText,
            chunkSize: 512,
          },
          correlationId,
        );
        this.logger.log(`Queued embedding task for share ${shareId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to queue ML tasks for share ${shareId}: ${error.message}`);
      // Don't fail the entire share processing if ML tasks fail to queue
    }
  }
}