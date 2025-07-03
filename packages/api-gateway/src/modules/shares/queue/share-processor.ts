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
import { FetcherError, FetcherErrorCode, RetryableFetcherError } from '../fetchers/interfaces/fetcher-error.interface';
import { Platform } from '../constants/platform.enum';
import { Inject } from '@nestjs/common';
import { MLProducerService } from '../../ml/ml-producer.service';
import { WorkflowService } from '../services/workflow.service';
import { VideoWorkflowState } from '../../../shares/types/workflow.types';
import { FetchResponse } from '../fetchers/interfaces/content-fetcher.interface';
import { SharesRepository } from '../repositories/shares.repository';
import { WorkerRateLimiterService } from '../services/worker-rate-limiter.service';
import { RateLimitError } from '../../../common/rate-limiter';

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
    @Inject('MLProducerService') private readonly mlProducer: MLProducerService,
    private readonly workflowService: WorkflowService,
    private readonly sharesRepository: SharesRepository,
    private readonly rateLimiter: WorkerRateLimiterService,
  ) {
    // Get configuration with defaults
    this.processingDelayMs = this.configService.get('WORKER_DELAY_MS', 5000);
  }

  /**
   * Check if content is a video that requires enhancement workflow
   */
  private isVideoContent(fetchResult: FetchResponse): boolean {
    return fetchResult.media?.type === 'video' && 
           fetchResult.media?.url != null;
  }

  /**
   * Check if platform requires video enhancement
   */
  private requiresEnhancement(platform: string): boolean {
    // Platforms that support video enhancement workflow
    const enhancementPlatforms = ['tiktok', 'youtube'];
    return enhancementPlatforms.includes(platform.toLowerCase());
  }

  /**
   * Check if video enhancement feature is enabled
   */
  private isVideoEnhancementEnabled(userId: string): boolean {
    // TODO: Integrate with feature flag service
    // For now, return true for development
    const videoEnhancementV2 = this.configService.get('VIDEO_ENHANCEMENT_V2_ENABLED', false);
    return videoEnhancementV2;
  }

  /**
   * Process video content with enhanced two-track workflow
   */
  private async processVideoEnhancement(share: any, fetchResult: FetchResponse): Promise<void> {
    this.logger.log(`Processing video enhancement for share ${share.id}`);
    
    // FAST TRACK: Generate immediate caption embedding
    if (fetchResult.content?.text) {
      try {
        let fastTrackText = fetchResult.content.text;
        
        // Queue basic embedding from caption/hashtags for immediate searchability
        await this.mlProducer.publishEmbeddingTask(
          share.id,
          {
            text: fastTrackText,
            type: 'caption',
            metadata: {
              title: share.title || fetchResult.content.text?.substring(0, 100),
              url: share.url,
              author: fetchResult.metadata?.author,
              platform: share.platform,
              isBasicEmbedding: true, // Flag to identify this as fast-track
            }
          },
          {
            embeddingType: 'content',
          }
        );
        this.logger.log(`Queued fast-track embedding for share ${share.id}`);
      } catch (error) {
        this.logger.error(`Failed to queue fast-track embedding: ${error.message}`);
      }
    }
    
    // ENHANCEMENT TRACK: Queue only transcription for videos
    if (fetchResult.media?.url && fetchResult.media.type === 'video') {
      // Only queue transcription if we have a valid local/S3 URL (not external)
      const isValidMediaUrl = !fetchResult.media.url.startsWith('http://') && 
                             !fetchResult.media.url.startsWith('https://');
      
      if (isValidMediaUrl) {
        try {
          // Update workflow state to indicate video is being transcribed
          await this.sharesRepository.updateWorkflowState(
            share.id, 
            VideoWorkflowState.TRANSCRIBING,
            { enhancementStartedAt: new Date() }
          );
          
          // Queue transcription task ONLY
          await this.mlProducer.publishTranscriptionTask(
            share.id,
            fetchResult.media.url
          );
          this.logger.log(`Queued transcription for video enhancement: ${share.id}`);
          
          // Note: ML Result Listener will handle the rest of the workflow
          // after transcription completes
        } catch (error) {
          this.logger.error(`Failed to start video enhancement: ${error.message}`);
          await this.sharesRepository.updateWorkflowState(
            share.id,
            VideoWorkflowState.FAILED_TRANSCRIPTION
          );
        }
      } else {
        this.logger.warn(`Skipping transcription for ${share.id} - invalid media URL: ${fetchResult.media.url}`);
        // Don't update workflow state - leave it as is since we couldn't process the video
      }
    }
    
    // Queue media download if needed
    if (fetchResult.media?.url) {
      await this.queueMediaDownload(share.id, fetchResult.media);
    }
  }

  /**
   * Process non-video content with standard parallel workflow
   */
  private async processStandardContent(share: any, fetchResult: FetchResponse): Promise<void> {
    // Queue ML tasks if content text is available
    if (fetchResult.content?.text) {
      try {
        // Special handling for Reddit text-only posts
        const isRedditTextOnly = share.platform === Platform.REDDIT && 
                                fetchResult.hints?.isRedditTextOnly === true;
        
        // Prepare content text for ML processing
        let contentForML: string;
        if (isRedditTextOnly && fetchResult.content.description) {
          // For Reddit text-only posts, combine title and selftext
          contentForML = `${fetchResult.content.text}\n\n${fetchResult.content.description}`;
          this.logger.log(`Processing Reddit text-only post ${share.id} with combined title and selftext`);
        } else {
          // For other content, use the primary text
          contentForML = fetchResult.content.text;
        }
        
        // Queue summarization task
        await this.mlProducer.publishSummarizationTask(
          share.id,
          {
            text: contentForML,
            title: share.title || fetchResult.content.text?.substring(0, 100),
            url: share.url,
            contentType: share.platform,
          },
          {
            style: 'brief',
            maxLength: 500,
          }
        );
        this.logger.log(`Queued summarization task for share ${share.id}`);
        
        // Queue embedding task
        await this.mlProducer.publishEmbeddingTask(
          share.id,
          {
            text: contentForML,
            type: this.mapPlatformToContentType(share.platform as Platform),
            metadata: {
              title: share.title || fetchResult.content.text?.substring(0, 100),
              url: share.url,
              author: fetchResult.metadata?.author,
              platform: share.platform,
            }
          },
          {
            embeddingType: 'content',
          }
        );
        this.logger.log(`Queued embedding task for share ${share.id}`);
      } catch (mlError) {
        this.logger.error(`Failed to queue ML task for share ${share.id}: ${mlError.message}`);
      }
    }
    
    // For standard content, still queue transcription if video exists
    if (fetchResult.media?.url && fetchResult.media.type === 'video') {
      try {
        await this.mlProducer.publishTranscriptionTask(
          share.id,
          fetchResult.media.url
        );
        this.logger.log(`Queued transcription task for share ${share.id}`);
      } catch (mlError) {
        this.logger.error(`Failed to queue transcription task: ${mlError.message}`);
      }
    }
    
    // Queue media download if needed
    if (fetchResult.media?.url) {
      await this.queueMediaDownload(share.id, fetchResult.media);
    }
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
        
        // Check rate limit before making external API call
        try {
          await this.rateLimiter.checkPlatformLimit({
            platform: share.platform.toLowerCase(),
            userId: share.userId,
          });
        } catch (rateLimitError) {
          if (rateLimitError instanceof RateLimitError) {
            // Convert to RetryableFetcherError for consistent error handling
            throw new RetryableFetcherError(
              `Rate limit exceeded for ${share.platform}`,
              FetcherErrorCode.RATE_LIMIT_EXCEEDED,
              share.platform as Platform,
              rateLimitError.retryAfter,
              { originalError: rateLimitError }
            );
          }
          throw rateLimitError;
        }
        
        const fetcher = this.fetcherRegistry.getFetcher(share.platform as Platform);
        const fetchResult = await fetcher.fetchContent({
          url: share.url,
          shareId: share.id,
          userId: share.userId,
        });
        
        // Store the fetched metadata (Task 2.8 will implement this)
        await this.storeMetadata(job.data.shareId, fetchResult);
        
        // Determine processing path based on content type and feature flags
        if (this.isVideoEnhancementEnabled(share.userId) && 
            this.isVideoContent(fetchResult) && 
            this.requiresEnhancement(share.platform)) {
          // VIDEO ENHANCEMENT WORKFLOW (Two-track)
          await this.processVideoEnhancement(share, fetchResult);
        } else {
          // STANDARD WORKFLOW (Existing parallel processing)
          await this.processStandardContent(share, fetchResult);
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
          
          // Handle rate limit errors with smart requeue
          if (fetchError.code === FetcherErrorCode.RATE_LIMIT_EXCEEDED && 
              fetchError instanceof RetryableFetcherError) {
            const delay = await this.rateLimiter.getRequeueDelay(
              new RateLimitError(
                fetchError.message,
                share.platform.toLowerCase(),
                fetchError.retryAfterSeconds,
                Date.now() + (fetchError.retryAfterSeconds * 1000)
              ),
              job
            );
            
            this.logger.warn(
              `Rate limit hit for ${share.platform}, requeuing with delay: ${delay}ms`
            );
            
            // Update the job's delay for next retry
            job.opts.delay = delay;
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
   * Map platform to content type for embeddings
   */
  private mapPlatformToContentType(platform: Platform): 'caption' | 'transcript' | 'article' | 'comment' | 'tweet' {
    switch (platform) {
      case Platform.TIKTOK:
        return 'caption';
      case Platform.TWITTER:
        return 'tweet';
      case Platform.REDDIT:
        return 'comment';
      case Platform.YOUTUBE:
        return 'transcript';
      default:
        return 'article';
    }
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
}