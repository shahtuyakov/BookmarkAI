import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { ConfigService } from '../../../config/services/config.service';
import { shares } from '../../../db/schema/shares';
import { youtubeContent, youtubeChapters, youtubeEnhancements } from '../../../db/schema/youtube';
import { SHARE_QUEUE, SHARE_PROCESS_JOB } from './share-queue.constants';
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
import { YouTubeProcessingStrategy, YouTubeEnhancementData } from '../fetchers/types/youtube.types';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { YouTubeTranscriptService } from '../services/youtube-transcript.service';
import { YouTubeChapterService } from '../services/youtube-chapter.service';

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
    @InjectQueue(SHARE_QUEUE.NAME) private readonly shareQueue: Queue,
    private readonly youtubeTranscriptService: YouTubeTranscriptService,
    private readonly youtubeChapterService: YouTubeChapterService,
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
    const enhancementPlatforms = ['tiktok'];
    // YouTube will use its own enhancement path
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
   * Process YouTube content with ADR-213 two-phase enhancement workflow
   */
  private async processYouTubeEnhancement(share: any, fetchResult: FetchResponse): Promise<void> {
    this.logger.log(`Processing YouTube enhancement for share ${share.id}`);
    
    const processingStrategy = fetchResult.platformData?.processingStrategy as YouTubeProcessingStrategy | undefined;
    if (!processingStrategy) {
      this.logger.warn(`No processing strategy found for YouTube share ${share.id}`);
      return this.processStandardContent(share, fetchResult);
    }

    // Phase 1 already completed in fetcher (basic metadata stored)
    // Phase 2: Queue enhancement based on content type
    
    // 1. Quick embedding from the fetcher's pre-processed content
    const quickEmbeddingContent = fetchResult.platformData?.quickEmbeddingContent as string | undefined;
    if (quickEmbeddingContent) {
      try {
        await this.mlProducer.publishEmbeddingTask(
          share.id,
          {
            text: quickEmbeddingContent,
            type: 'caption',
            metadata: {
              title: share.title || fetchResult.content.text,
              url: share.url,
              author: fetchResult.metadata?.author,
              platform: share.platform,
              contentType: processingStrategy.type,
              isBasicEmbedding: true,
            }
          },
          {
            embeddingType: 'content',
          }
        );
        this.logger.log(`Queued YouTube quick embedding for share ${share.id}`);
      } catch (error) {
        this.logger.error(`Failed to queue YouTube quick embedding: ${error.message}`);
      }
    }

    // 2. For non-music content, queue transcription/enhancement
    if (processingStrategy.transcriptionStrategy !== 'skip') {
      // For YouTube, we'll need to download the video first
      // This is a placeholder - actual implementation would use YouTube download service
      this.logger.log(
        `YouTube enhancement for ${processingStrategy.type} content would be queued here. ` +
        `Strategy: ${processingStrategy.transcriptionStrategy}, ` +
        `Priority: ${processingStrategy.processingPriority}`
      );
      
      // Queue YouTube enhancement for Phase 2 processing
      try {
        const enhancementData: YouTubeEnhancementData = {
          shareId: share.id,
          videoId: fetchResult.platformData?.id as string, // YouTube API stores video ID as 'id'
          processingStrategy,
          apiData: fetchResult.platformData as any, // platformData contains the spread YouTube API data
          priority: processingStrategy.processingPriority,
        };

        // Queue YouTube enhancement job using the same queue but different job name
        await this.shareQueue.add(
          'youtube.enhancement', // Different job name for YouTube enhancement
          enhancementData,
          {
            priority: processingStrategy.processingPriority,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000, // Start with 2s, matching the YouTube fetcher pattern
            },
            timeout: this.getTimeoutForContentType(processingStrategy.type),
          }
        );

        this.logger.log(
          `Queued YouTube Phase 2 enhancement for share ${share.id} ` +
          `(type: ${processingStrategy.type}, priority: ${processingStrategy.processingPriority})`
        );
      } catch (error) {
        this.logger.error(`Failed to queue YouTube enhancement: ${error.message}`);
        // Fall back to standard processing if enhancement queue fails
        this.logger.warn(`Falling back to standard processing for share ${share.id}`);
        return this.processStandardContent(share, fetchResult);
      }
    }

    // 3. Store YouTube-specific metadata
    try {
      await this.storeYouTubeMetadata(share.id, fetchResult);
    } catch (error) {
      this.logger.error(`Failed to store YouTube metadata: ${error.message}`);
    }
  }

  /**
   * Store YouTube-specific metadata in the database
   */
  private async storeYouTubeMetadata(shareId: string, fetchResult: FetchResponse): Promise<void> {
    this.logger.debug(`Storing YouTube metadata for share ${shareId}`);

    try {
      const videoData = fetchResult.platformData as any;
      const processingStrategy = videoData.processingStrategy as YouTubeProcessingStrategy;

      // Extract channel information
      const channelId = videoData.snippet?.channelId;
      const channelTitle = videoData.snippet?.channelTitle;

      // Extract video statistics
      const statistics = videoData.statistics || {};
      const viewCount = statistics.viewCount ? parseInt(statistics.viewCount, 10) : null;
      const likeCount = statistics.likeCount ? parseInt(statistics.likeCount, 10) : null;
      const commentCount = statistics.commentCount ? parseInt(statistics.commentCount, 10) : null;

      // Parse duration from ISO 8601 format (PT14M3S)
      const durationSeconds = this.parseDurationToSeconds(videoData.contentDetails?.duration || 'PT0S');

      // Extract content details
      const contentDetails = videoData.contentDetails || {};
      const snippet = videoData.snippet || {};

      // Determine content flags
      const isShort = durationSeconds < 60;
      const isLive = snippet.liveBroadcastContent === 'live';
      const isMusic = snippet.categoryId === '10'; // Music category

      // Parse published date
      const publishedAt = snippet.publishedAt ? new Date(snippet.publishedAt) : null;

      // Store in youtube_content table
      const youtubeContentRecord = {
        shareId,
        youtubeId: videoData.id,
        channelId,
        channelTitle,
        durationSeconds,
        viewCount,
        likeCount,
        commentCount,
        contentType: processingStrategy.type,
        processingPriority: processingStrategy.processingPriority,
        hasCaptions: contentDetails.caption === 'true',
        isShort,
        isLive,
        isMusic,
        contentRating: contentDetails.contentRating?.ytRating || null,
        privacyStatus: snippet.privacyStatus || 'public',
        publishedAt,
        tags: snippet.tags || [],
        downloadStrategy: processingStrategy.downloadStrategy,
        transcriptionStrategy: processingStrategy.transcriptionStrategy,
      };

      const [insertedContent] = await this.db.database
        .insert(youtubeContent)
        .values(youtubeContentRecord)
        .returning({ id: youtubeContent.id });

      this.logger.log(`Successfully stored YouTube content metadata for share ${shareId}, youtube_content_id: ${insertedContent.id}`);

    } catch (error) {
      this.logger.error(`Failed to store YouTube metadata for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse ISO 8601 duration to seconds (PT12M44S format)
   */
  private parseDurationToSeconds(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Initialize enhancement tracking for YouTube content
   */
  private async initializeEnhancementTracking(shareId: string, processingStrategy: YouTubeProcessingStrategy): Promise<void> {
    try {
      // Retry logic to wait for YouTube metadata to be stored (handles race condition)
      let contentRecord = null;
      let retries = 0;
      const maxRetries = 5;
      const retryDelay = 1000; // 1 second

      while (!contentRecord && retries < maxRetries) {
        [contentRecord] = await this.db.database
          .select({ id: youtubeContent.id })
          .from(youtubeContent)
          .where(eq(youtubeContent.shareId, shareId))
          .limit(1);

        if (!contentRecord) {
          retries++;
          if (retries < maxRetries) {
            this.logger.debug(`YouTube content not found for share ${shareId}, retrying in ${retryDelay}ms (attempt ${retries}/${maxRetries})`);
            await this.delay(retryDelay);
          }
        }
      }

      if (!contentRecord) {
        throw new Error(`YouTube content record not found for share ${shareId} after ${maxRetries} retries`);
      }

      // Check if enhancement tracking already exists
      const [existingRecord] = await this.db.database
        .select({ id: youtubeEnhancements.id })
        .from(youtubeEnhancements)
        .where(eq(youtubeEnhancements.shareId, shareId))
        .limit(1);

      if (existingRecord) {
        this.logger.debug(`Enhancement tracking already exists for share ${shareId}`);
        return;
      }

      // Initialize enhancement tracking record
      const enhancementRecord = {
        shareId,
        youtubeContentId: contentRecord.id,
        downloadStatus: processingStrategy.downloadStrategy === 'none' ? 'skipped' : 'pending',
        transcriptionStatus: processingStrategy.transcriptionStrategy === 'skip' ? 'skipped' : 'pending',
        summaryStatus: 'pending',
        embeddingStatus: 'pending',
        retryCount: 0,
      };

      await this.db.database
        .insert(youtubeEnhancements)
        .values(enhancementRecord);

      this.logger.debug(`Initialized enhancement tracking for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize enhancement tracking for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update enhancement status in the database
   */
  private async updateEnhancementStatus(shareId: string, updates: Partial<any>): Promise<void> {
    try {
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.shareId, shareId));

      this.logger.debug(`Updated enhancement status for share ${shareId}:`, updates);
    } catch (error) {
      this.logger.error(`Failed to update enhancement status for share ${shareId}: ${error.message}`);
      throw error;
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
   * Process YouTube enhancement jobs
   * Handles Phase 2 background processing for YouTube content
   */
  @Process({
    name: 'youtube.enhancement',
    concurrency: 2,
  })
  async processYouTubeEnhancementJob(job: Job<YouTubeEnhancementData>) {
    const { shareId, videoId, processingStrategy, apiData } = job.data;
    
    this.logger.log(
      `Processing YouTube enhancement job for share ${shareId}, video ${videoId}, ` +
      `type: ${processingStrategy.type}`
    );
    
    const startTime = Date.now();
    
    try {
      // Initialize enhancement tracking
      await this.initializeEnhancementTracking(shareId, processingStrategy);
      
      // Mark Phase 2 as started
      await this.updateEnhancementStatus(shareId, { phase2StartedAt: new Date() });
      // Skip processing for music content
      if (processingStrategy.type === 'youtube_music') {
        this.logger.log(`Skipping enhancement for music content: ${shareId}`);
        await this.updateShareStatus(shareId, ShareStatus.DONE);
        return { shareId, videoId, status: 'skipped', reason: 'music_content' };
      }

      // Always try to fetch captions first (most videos have auto-generated captions)
      // The caption field only indicates if the owner uploaded captions, not auto-generated ones
      this.logger.log(`Attempting to fetch captions for YouTube video ${videoId}`);
      
      // Use the main fetchTranscript method which handles both API and yt-dlp fallback
      const transcript = await this.youtubeTranscriptService.fetchTranscript(videoId);
      
      let processingMethod = 'transcription_pending';
      
      if (transcript) {
        processingMethod = 'captions';
        this.logger.log(`Successfully fetched transcript for video ${videoId}`);
        
        // Update transcription status to completed
        await this.updateEnhancementStatus(shareId, {
          transcriptionStatus: 'completed',
          transcriptionSource: 'youtube_api', // or yt-dlp based on source
        });
        
        // Check if it's a placeholder or actual transcript
        if (transcript.startsWith('CAPTIONS_UNAVAILABLE:')) {
          this.logger.warn(`Captions detected but extraction failed for ${videoId}. Falling back to video download.`);
          processingMethod = 'transcription_fallback';
          // TODO: Implement video download + Whisper transcription
        } else {
          // Queue summarization with the transcript
          await this.mlProducer.publishSummarizationTask(
            shareId,
            {
              text: transcript,
              title: apiData?.snippet?.title || 'YouTube Video',
              url: `https://youtube.com/watch?v=${videoId}`,
              contentType: 'youtube',
            },
            {
              style: 'detailed',
              maxLength: 1000,
            }
          );
          
          this.logger.log(`Queued summarization task for share ${shareId} using captions`);
          
          // Also queue embedding with the full transcript
          await this.mlProducer.publishEmbeddingTask(
            shareId,
            {
              text: transcript,
              type: 'transcript',
              metadata: {
                title: apiData?.snippet?.title || 'YouTube Video',
                url: `https://youtube.com/watch?v=${videoId}`,
                author: apiData?.snippet?.channelTitle,
                platform: 'youtube',
                contentType: processingStrategy.type,
                isEnhancedEmbedding: true, // Mark as enhanced Phase 2 embedding
              }
            },
            {
              embeddingType: 'content',
            }
          );
          
          this.logger.log(`Queued enhanced embedding task for share ${shareId}`);

          // Extract and process chapters if video is long enough
          await this.processVideoChapters(shareId, videoId, apiData, transcript);
        }
      } else {
        this.logger.warn(`No transcript found for video ${videoId} - would fall back to video download + Whisper`);
        processingMethod = 'video_download_pending';
        
        // TODO: Implement video download + transcription fallback
        // For now, just queue a basic embedding with the title and description
        const fallbackText = `${apiData?.snippet?.title || 'YouTube Video'}. ${apiData?.snippet?.description || ''}`.substring(0, 1000);
        
        await this.mlProducer.publishEmbeddingTask(
          shareId,
          {
            text: fallbackText,
            type: 'caption',
            metadata: {
              title: apiData?.snippet?.title || 'YouTube Video',
              url: `https://youtube.com/watch?v=${videoId}`,
              author: apiData?.snippet?.channelTitle,
              platform: 'youtube',
              contentType: processingStrategy.type,
              isFallbackEmbedding: true,
            }
          },
          {
            embeddingType: 'content',
          }
        );
        
        this.logger.log(`Queued fallback embedding for share ${shareId} - video download implementation pending`);
      }
      
      // Simulate processing
      await this.delay(2000);
      
      // Mark Phase 2 as completed with final timing
      const endTime = Date.now();
      const totalProcessingTime = Math.round((endTime - startTime) / 1000);
      
      await this.updateEnhancementStatus(shareId, {
        phase2CompletedAt: new Date(),
        totalProcessingTimeSeconds: totalProcessingTime,
        embeddingStatus: 'completed', // Assuming embeddings were queued successfully
        summaryStatus: 'completed',   // Assuming summary was queued successfully
      });
      
      // Update share status to indicate YouTube Phase 2 enhancement is complete
      await this.updateShareStatus(shareId, ShareStatus.ENRICHED);
      
      return {
        shareId,
        videoId,
        status: 'completed',
        processedAt: new Date(),
        method: processingMethod
      };
    } catch (error) {
      this.logger.error(
        `YouTube enhancement failed for share ${shareId}: ${error.message}`,
        error.stack
      );
      
      // Handle YouTube-specific errors with custom retry strategies
      if (this.isYouTubeQuotaError(error)) {
        this.logger.warn(`YouTube API quota exceeded for share ${shareId}, will retry after quota reset`);
        
        // For quota exceeded, don't mark as error - let it retry after 24 hours
        // Set custom retry delay for quota exceeded
        const quotaResetDelay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        job.opts.delay = quotaResetDelay;
        
        // Re-throw with specific message to trigger Bull's retry with custom delay
        throw new Error(`YouTube API quota exceeded. Retrying after quota reset in 24 hours.`);
      }
      
      if (this.isYouTubeRateLimitError(error)) {
        this.logger.warn(`YouTube API rate limit hit for share ${shareId}, will retry with exponential backoff`);
        
        // For rate limiting, use shorter delay (1 hour)
        const rateLimitDelay = 60 * 60 * 1000; // 1 hour in milliseconds
        job.opts.delay = rateLimitDelay;
        
        throw new Error(`YouTube API rate limited. Retrying in 1 hour.`);
      }
      
      if (this.isYouTubeTransientError(error)) {
        this.logger.warn(`YouTube transient error for share ${shareId}, will retry with standard backoff`);
        // Let Bull handle standard exponential backoff for transient errors
        throw error;
      }
      
      // For permanent errors (video not found, private, etc.), mark as error and don't retry
      if (this.isYouTubePermanentError(error)) {
        this.logger.error(`YouTube permanent error for share ${shareId}: ${error.message}`);
        await this.updateShareStatus(shareId, ShareStatus.ERROR);
        return { shareId, videoId, status: 'failed', reason: 'permanent_error', error: error.message };
      }
      
      // For unknown errors, mark as error after retries are exhausted
      await this.updateShareStatus(shareId, ShareStatus.ERROR);
      throw error; // Let Bull handle retries
    }
  }

  /**
   * Process a share
   * In Phase 1, this simulates processing with a delay
   * In Phase 2+, this will integrate with fetchers and ML services
   */
  @Process({
    name: SHARE_PROCESS_JOB,
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
        
        // Update rate limit state based on API response headers
        if (fetchResult.responseHeaders) {
          await this.rateLimiter.updateFromResponse(
            share.platform.toLowerCase(),
            fetchResult.responseHeaders,
            share.userId
          );
        }
        
        // Store the fetched metadata (Task 2.8 will implement this)
        await this.storeMetadata(job.data.shareId, fetchResult);
        
        // Determine processing path based on content type and feature flags
        if (share.platform === Platform.YOUTUBE && fetchResult.platformData?.processingStrategy) {
          // YOUTUBE ENHANCEMENT WORKFLOW (Two-phase)
          await this.processYouTubeEnhancement(share, fetchResult);
          // Update status to "fetched" - Phase 1 complete, Phase 2 queued
          await this.updateShareStatus(job.data.shareId, ShareStatus.FETCHED);
        } else if (this.isVideoEnhancementEnabled(share.userId) && 
            this.isVideoContent(fetchResult) && 
            this.requiresEnhancement(share.platform)) {
          // VIDEO ENHANCEMENT WORKFLOW (Two-track)
          await this.processVideoEnhancement(share, fetchResult);
          // Single-phase platforms use DONE status
          await this.updateShareStatus(job.data.shareId, ShareStatus.DONE);
        } else {
          // STANDARD WORKFLOW (Existing parallel processing)
          await this.processStandardContent(share, fetchResult);
          // Single-phase platforms use DONE status
          await this.updateShareStatus(job.data.shareId, ShareStatus.DONE);
        }
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
      // For YouTube, status is FETCHED after Phase 1, ENRICHED after Phase 2
      const finalStatus = share.platform === Platform.YOUTUBE 
        ? ShareStatus.FETCHED  // Phase 1 complete, Phase 2 queued
        : ShareStatus.DONE;     // Single-phase complete
        
      return { 
        id: share.id, 
        url: share.url, 
        status: finalStatus,
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
   * Get timeout based on YouTube content type
   */
  private getTimeoutForContentType(contentType: string): number {
    switch (contentType) {
      case 'youtube_short':
        return 5 * 60 * 1000; // 5 minutes
      case 'youtube_standard':
        return 15 * 60 * 1000; // 15 minutes
      case 'youtube_long':
        return 30 * 60 * 1000; // 30 minutes
      case 'youtube_edu':
        return 30 * 60 * 1000; // 30 minutes
      case 'youtube_music':
        return 2 * 60 * 1000; // 2 minutes (metadata only)
      default:
        return 15 * 60 * 1000; // 15 minutes default
    }
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

  /**
   * Process video chapters - extract and store chapters with embeddings
   */
  private async processVideoChapters(
    shareId: string, 
    videoId: string, 
    apiData: any, 
    transcript: string
  ): Promise<void> {
    try {
      this.logger.log(`Processing chapters for video ${videoId}`);
      
      // Extract chapters using the chapter service
      const chapterResult = await this.youtubeChapterService.extractChapters(apiData, transcript);
      
      if (!chapterResult.hasChapters) {
        this.logger.debug(`No chapters found for video ${videoId} (${chapterResult.extractionMethod})`);
        return;
      }
      
      this.logger.log(
        `Found ${chapterResult.chapters.length} chapters for video ${videoId} using ${chapterResult.extractionMethod}`
      );
      
      // Store chapters in database and generate embeddings for each
      await this.storeVideoChapters(shareId, chapterResult.chapters);
      
      // Generate individual embeddings for each chapter
      for (const chapter of chapterResult.chapters) {
        await this.generateChapterEmbedding(shareId, videoId, chapter, apiData);
      }
      
      this.logger.log(`Successfully processed ${chapterResult.chapters.length} chapters for video ${videoId}`);
      
    } catch (error) {
      this.logger.error(`Failed to process chapters for video ${videoId}: ${error.message}`, error.stack);
      // Don't throw - chapter processing is optional and shouldn't fail the entire job
    }
  }

  /**
   * Store video chapters in the database
   */
  private async storeVideoChapters(shareId: string, chapters: any[]): Promise<void> {
    try {
      this.logger.debug(`Storing ${chapters.length} chapters for share ${shareId}`);

      // First, get the youtube_content_id for this share
      const [contentRecord] = await this.db.database
        .select({ id: youtubeContent.id })
        .from(youtubeContent)
        .where(eq(youtubeContent.shareId, shareId))
        .limit(1);

      if (!contentRecord) {
        throw new Error(`YouTube content record not found for share ${shareId}`);
      }

      // Prepare chapter records for insertion
      const chapterRecords = chapters.map(chapter => ({
        youtubeContentId: contentRecord.id,
        shareId,
        startSeconds: chapter.startSeconds,
        endSeconds: chapter.endSeconds,
        title: chapter.title,
        transcriptSegment: chapter.transcriptSegment,
        chapterOrder: chapter.order,
        durationSeconds: chapter.endSeconds ? chapter.endSeconds - chapter.startSeconds : null,
      }));

      // Insert all chapters at once
      const insertedChapters = await this.db.database
        .insert(youtubeChapters)
        .values(chapterRecords)
        .returning({ id: youtubeChapters.id, title: youtubeChapters.title });

      this.logger.log(`Successfully stored ${insertedChapters.length} chapters for share ${shareId}`);
      
    } catch (error) {
      this.logger.error(`Failed to store chapters for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate embedding for a single chapter
   */
  private async generateChapterEmbedding(
    shareId: string, 
    videoId: string, 
    chapter: any, 
    apiData: any
  ): Promise<void> {
    try {
      // Create rich chapter content for embedding
      const chapterContent = this.createChapterEmbeddingContent(chapter, apiData);
      
      await this.mlProducer.publishEmbeddingTask(
        shareId,
        {
          text: chapterContent,
          type: 'transcript',
          metadata: {
            title: `${apiData?.snippet?.title || 'YouTube Video'} - ${chapter.title}`,
            url: `https://youtube.com/watch?v=${videoId}&t=${chapter.startSeconds}s`,
            author: apiData?.snippet?.channelTitle,
            platform: 'youtube',
            chapterTitle: chapter.title,
            startSeconds: chapter.startSeconds,
            endSeconds: chapter.endSeconds,
            chapterOrder: chapter.order,
            isChapterEmbedding: true,
          }
        },
        {
          embeddingType: 'content',
        }
      );
      
      this.logger.debug(`Queued chapter embedding for "${chapter.title}" (${chapter.startSeconds}s-${chapter.endSeconds}s)`);
      
    } catch (error) {
      this.logger.error(`Failed to queue chapter embedding for chapter "${chapter.title}": ${error.message}`);
      // Don't throw - continue processing other chapters
    }
  }

  /**
   * Create rich content for chapter embedding
   */
  private createChapterEmbeddingContent(chapter: any, apiData: any): string {
    const parts = [
      chapter.title,
      chapter.transcriptSegment || '',
      `Timestamp: ${this.formatTimestamp(chapter.startSeconds)} - ${this.formatTimestamp(chapter.endSeconds)}`,
      `From video: ${apiData?.snippet?.title || ''}`,
      `By: ${apiData?.snippet?.channelTitle || ''}`,
    ].filter(Boolean);
    
    return parts.join('. ').substring(0, 8000); // Limit content size
  }

  /**
   * Format seconds to timestamp string
   */
  private formatTimestamp(seconds: number): string {
    if (!seconds) return '0:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Check if error is a YouTube API quota exceeded error
   */
  private isYouTubeQuotaError(error: any): boolean {
    return (
      error?.message?.includes('quota') ||
      error?.message?.includes('quotaExceeded') ||
      error?.code === 'YOUTUBE_QUOTA_EXCEEDED' ||
      (error?.response?.status === 403 && 
       error?.response?.data?.error?.message?.includes('quota'))
    );
  }

  /**
   * Check if error is a YouTube API rate limit error
   */
  private isYouTubeRateLimitError(error: any): boolean {
    return (
      error?.response?.status === 429 ||
      error?.message?.includes('rate limit') ||
      error?.message?.includes('Too Many Requests') ||
      error?.code === 'YOUTUBE_RATE_LIMITED'
    );
  }

  /**
   * Check if error is a transient YouTube error that should be retried
   */
  private isYouTubeTransientError(error: any): boolean {
    return (
      error?.response?.status >= 500 || // Server errors
      error?.code === 'ECONNRESET' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ETIMEDOUT' ||
      error?.message?.includes('timeout') ||
      error?.message?.includes('network') ||
      error?.message?.includes('connection')
    );
  }

  /**
   * Check if error is a permanent YouTube error that should not be retried
   */
  private isYouTubePermanentError(error: any): boolean {
    return (
      error?.code === 'YOUTUBE_VIDEO_NOT_FOUND' ||
      error?.code === 'YOUTUBE_VIDEO_PRIVATE' ||
      error?.code === 'YOUTUBE_VIDEO_RESTRICTED' ||
      error?.code === 'YOUTUBE_INVALID_VIDEO_ID' ||
      error?.code === 'YOUTUBE_API_KEY_INVALID' ||
      (error?.response?.status === 404) ||
      (error?.response?.status === 403 && 
       !error?.response?.data?.error?.message?.includes('quota'))
    );
  }
}