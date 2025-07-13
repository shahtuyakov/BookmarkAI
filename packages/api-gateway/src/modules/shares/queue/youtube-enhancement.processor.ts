import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { YOUTUBE_ENHANCEMENT_QUEUE } from './youtube-enhancement-queue.constants';
import { YouTubeEnhancementData, YouTubeContentType } from '../fetchers/types/youtube.types';
import { YtDlpService } from '../services/ytdlp.service';
import { MLProducerService } from '../../ml/ml-producer.service';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { shares } from '../../../db/schema/shares';
import { youtubeContent, youtubeEnhancements } from '../../../db/schema/youtube';
import { eq } from 'drizzle-orm';
import { VideoWorkflowState } from '../../../shares/types/workflow.types';
import { YouTubeError } from '../fetchers/errors/youtube.error';
import { YouTubeErrorCode } from '../fetchers/types/youtube.types';
import { ShareStatus } from '../constants/share-status.enum';

// Type for enhancement record from database
type EnhancementRecord = typeof youtubeEnhancements.$inferSelect;

/**
 * Processor for YouTube enhancement jobs
 * Handles Phase 2 background processing pipeline
 */
@Processor(YOUTUBE_ENHANCEMENT_QUEUE.NAME)
@Injectable()
export class YouTubeEnhancementProcessor {
  private readonly logger = new Logger(YouTubeEnhancementProcessor.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly ytDlpService: YtDlpService,
    @Inject('MLProducerService') private readonly mlProducerService: MLProducerService,
    // TODO: Add YouTubeDownloadService once created
  ) {}

  /**
   * Main processor for YouTube enhancement jobs
   */
  @Process(YOUTUBE_ENHANCEMENT_QUEUE.JOBS.ENHANCE_CONTENT)
  async processEnhancement(job: Job<YouTubeEnhancementData>): Promise<void> {
    const { shareId, videoId, processingStrategy, apiData } = job.data;
    
    this.logger.log(
      `Starting YouTube enhancement for share ${shareId}, video ${videoId}, ` +
      `type: ${processingStrategy.type}`
    );

    try {
      // Create or update enhancement tracking record
      const [enhancement] = await this.db.database
        .select()
        .from(youtubeEnhancements)
        .where(eq(youtubeEnhancements.shareId, shareId))
        .limit(1);

      let enhancementId: string;
      
      if (!enhancement) {
        // Get YouTube content ID
        const [ytContent] = await this.db.database
          .select()
          .from(youtubeContent)
          .where(eq(youtubeContent.shareId, shareId))
          .limit(1);
          
        if (!ytContent) {
          throw new Error(`YouTube content not found for share ${shareId}`);
        }
        
        // Create new enhancement record
        const [newEnhancement] = await this.db.database
          .insert(youtubeEnhancements)
          .values({
            shareId,
            youtubeContentId: ytContent.id,
            downloadStatus: 'pending',
            transcriptionStatus: 'pending',
            summaryStatus: 'pending',
            phase2StartedAt: new Date(),
            retryCount: 0,
          })
          .returning();
          
        enhancementId = newEnhancement.id;
      } else {
        enhancementId = enhancement.id;
        
        // Update phase 2 started timestamp
        await this.db.database
          .update(youtubeEnhancements)
          .set({
            phase2StartedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(youtubeEnhancements.id, enhancementId));
      }

      // Update job progress
      await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.METADATA);

      // Process based on content type
      switch (processingStrategy.type) {
        case YouTubeContentType.MUSIC:
          await this.processMusicContent(job, enhancementId);
          break;
        case YouTubeContentType.SHORT:
          await this.processShortContent(job, enhancementId);
          break;
        case YouTubeContentType.EDUCATIONAL:
          await this.processEducationalContent(job, enhancementId);
          break;
        case YouTubeContentType.LONG:
          await this.processLongContent(job, enhancementId);
          break;
        default:
          await this.processStandardContent(job, enhancementId);
      }

      // Mark enhancement as complete
      await this.completeEnhancement(enhancementId, shareId);
      
      this.logger.log(`Completed YouTube enhancement for share ${shareId}`);
    } catch (error) {
      await this.handleEnhancementError(job, error);
      throw error;
    }
  }

  /**
   * Process music content (metadata only, no download)
   */
  private async processMusicContent(
    job: Job<YouTubeEnhancementData>,
    enhancementId: string
  ): Promise<void> {
    const { shareId } = job.data;
    
    this.logger.log(`Processing music content for share ${shareId} - metadata only`);
    
    // Update progress
    await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.COMPLETE);
    
    // Update enhancement status
    await this.db.database
      .update(youtubeEnhancements)
      .set({
        downloadStatus: 'skipped',
        transcriptionStatus: 'skipped',
        summaryStatus: 'completed',
        phase2CompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(youtubeEnhancements.id, enhancementId));
    
    // Music content relies on metadata from Phase 1
    // No additional ML processing needed
  }

  /**
   * Process YouTube Shorts (fast processing, full video)
   */
  private async processShortContent(
    job: Job<YouTubeEnhancementData>,
    enhancementId: string
  ): Promise<void> {
    const { shareId, videoId, processingStrategy } = job.data;
    
    this.logger.log(`Processing YouTube Short for share ${shareId}`);
    
    // Download video at 360p
    await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.DOWNLOAD);
    
    try {
      // TODO: Implement download when YouTubeDownloadService is created
      // For now, use yt-dlp directly
      const downloadResult = await this.ytDlpService.extractVideoInfo(
        `https://youtube.com/watch?v=${videoId}`,
        true // download the video
      );
      
      if (!downloadResult || !downloadResult.storageUrl) {
        throw new Error('Failed to download video');
      }
      
      // Update download status
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          downloadStatus: 'completed',
          downloadFilePath: downloadResult.storageUrl,
          downloadFileSize: downloadResult.fileSize || 0,
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      
      // Queue transcription
      await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.TRANSCRIPT);
      await this.queueTranscription(shareId, downloadResult.storageUrl, 'whisper_full');
      
      // Update transcription status
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          transcriptionStatus: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      
      // Update share workflow state
      await this.updateShareWorkflowState(shareId, VideoWorkflowState.TRANSCRIBING);
      
    } catch (error) {
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          downloadStatus: 'failed',
          errorDetails: { error: error.message },
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      throw error;
    }
  }

  /**
   * Process educational content (high quality, may chunk for long videos)
   */
  private async processEducationalContent(
    job: Job<YouTubeEnhancementData>,
    enhancementId: string
  ): Promise<void> {
    // TODO: Implement similar to processShortContent
    // For now, delegate to standard processing
    return this.processStandardContent(job, enhancementId);
  }

  /**
   * Process long content (audio only, chunked transcription)
   */
  private async processLongContent(
    job: Job<YouTubeEnhancementData>,
    enhancementId: string
  ): Promise<void> {
    // TODO: Implement audio-only download
    // For now, delegate to standard processing
    return this.processStandardContent(job, enhancementId);
  }

  /**
   * Process standard content (default handling)
   */
  private async processStandardContent(
    job: Job<YouTubeEnhancementData>,
    enhancementId: string
  ): Promise<void> {
    const { shareId, videoId, processingStrategy } = job.data;
    
    this.logger.log(`Processing standard content for share ${shareId}`);
    
    // Download video
    await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.DOWNLOAD);
    
    try {
      // Use yt-dlp service directly for now
      const downloadResult = await this.ytDlpService.extractVideoInfo(
        `https://youtube.com/watch?v=${videoId}`,
        true // download the video
      );
      
      if (!downloadResult || !downloadResult.storageUrl) {
        throw new Error('Failed to download video');
      }
      
      // Update download status
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          downloadStatus: 'completed',
          downloadFilePath: downloadResult.storageUrl,
          downloadFileSize: downloadResult.fileSize || 0,
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      
      // Queue transcription
      await job.progress(YOUTUBE_ENHANCEMENT_QUEUE.PROGRESS_STAGES.TRANSCRIPT);
      await this.queueTranscription(shareId, downloadResult.storageUrl, 'whisper_full');
      
      // Update transcription status
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          transcriptionStatus: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      
      // Update share workflow state
      await this.updateShareWorkflowState(shareId, VideoWorkflowState.TRANSCRIBING);
      
    } catch (error) {
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          downloadStatus: 'failed',
          errorDetails: { error: error.message },
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancementId));
      throw error;
    }
  }

  /**
   * Queue transcription task via ML producer
   */
  private async queueTranscription(
    shareId: string,
    filePath: string,
    strategy: string
  ): Promise<void> {
    // The ML producer will handle the transcription
    // Strategy hints can be passed in the prompt option
    await this.mlProducerService.publishTranscriptionTask(
      shareId,
      filePath,
      {
        prompt: `Strategy: ${strategy}. This is a YouTube video requiring combined summary after transcription.`,
      }
    );
  }

  /**
   * Complete enhancement and update status
   */
  private async completeEnhancement(
    enhancementId: string,
    shareId: string
  ): Promise<void> {
    // Update enhancement record
    await this.db.database
      .update(youtubeEnhancements)
      .set({
        phase2CompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(youtubeEnhancements.id, enhancementId));

    // Update share status
    await this.db.database
      .update(shares)
      .set({
        status: ShareStatus.DONE,
        updatedAt: new Date(),
      })
      .where(eq(shares.id, shareId));
  }

  /**
   * Handle enhancement errors
   */
  private async handleEnhancementError(
    job: Job<YouTubeEnhancementData>,
    error: any
  ): Promise<void> {
    const { shareId } = job.data;
    
    this.logger.error(
      `YouTube enhancement failed for share ${shareId}: ${error.message}`,
      error.stack
    );

    // Update enhancement record
    const [enhancement] = await this.db.database
      .select()
      .from(youtubeEnhancements)
      .where(eq(youtubeEnhancements.shareId, shareId))
      .limit(1);

    if (enhancement) {
      await this.db.database
        .update(youtubeEnhancements)
        .set({
          errorDetails: { error: error.message, stack: error.stack },
          retryCount: (enhancement.retryCount || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(youtubeEnhancements.id, enhancement.id));
    }

    // Determine if we should retry based on error type
    if (error instanceof YouTubeError) {
      switch (error.code as string) {
        case YouTubeErrorCode.DOWNLOAD_FAILED:
        case YouTubeErrorCode.TRANSCRIPTION_FAILED:
          // These are retryable
          if (job.attemptsMade < job.opts.attempts) {
            throw error; // Let Bull retry
          }
          break;
        default:
          // Non-retryable errors
          await job.discard();
      }
    }
  }

  /**
   * Update share workflow state
   */
  private async updateShareWorkflowState(
    shareId: string,
    state: VideoWorkflowState
  ): Promise<void> {
    await this.db.database
      .update(shares)
      .set({
        workflowState: state,
        updatedAt: new Date(),
      })
      .where(eq(shares.id, shareId));
  }

  /**
   * Parse ISO 8601 duration to minutes
   */
  private parseDurationToMinutes(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    
    return hours * 60 + minutes + seconds / 60;
  }
}