import { Processor, Process } from '@nestjs/bull';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bull';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { MLProducerService } from '../../ml/ml-producer.service';
import { ML_RESULT_QUEUE } from './ml-result-queue.constants';
import { VideoWorkflowState } from '../../../shares/types/workflow.types';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { mlResults } from '../../../db/schema/ml-results';
import { shares } from '../../../db/schema/shares';
import { metadata } from '../../../db/schema/metadata';
import { v4 as uuidv4 } from 'uuid';

interface TranscriptionResult {
  transcript: string;
  duration?: number;
  language?: string;
}

/**
 * Processor that monitors ML results and triggers workflow continuations
 */
@Processor(ML_RESULT_QUEUE.NAME)
export class MLResultListenerProcessor {
  private readonly logger = new Logger(MLResultListenerProcessor.name);
  private lastCheckTimestamp: Date = new Date();

  constructor(
    private readonly db: DrizzleService,
    @Inject('MLProducerService') private readonly mlProducer: MLProducerService,
  ) {}

  /**
   * Periodically check for new transcription completions
   */
  @Process({
    name: ML_RESULT_QUEUE.JOBS.CHECK_COMPLETIONS,
    concurrency: 1,
  })
  async checkCompletions() {
    try {
      // Find shares in 'video_transcribing' state with completed transcriptions
      const completedTranscriptions = await this.db.database
        .select({
          shareId: mlResults.shareId,
          resultData: mlResults.resultData,
          createdAt: mlResults.createdAt,
          shareUrl: shares.url,
          sharePlatform: shares.platform,
          shareTitle: shares.title,
        })
        .from(mlResults)
        .innerJoin(shares, eq(shares.id, mlResults.shareId))
        .where(
          and(
            eq(mlResults.taskType, 'transcribe_whisper'),
            eq(shares.workflowState, VideoWorkflowState.TRANSCRIBING),
            gte(mlResults.createdAt, this.lastCheckTimestamp)
          )
        )
        .limit(10);

      for (const result of completedTranscriptions) {
        await this.processTranscriptionComplete({
          data: {
            shareId: result.shareId,
            transcriptionResult: result.resultData as TranscriptionResult,
            shareUrl: result.shareUrl,
            sharePlatform: result.sharePlatform,
            shareTitle: result.shareTitle,
          }
        } as Job);
      }

      // Update last check timestamp
      if (completedTranscriptions.length > 0) {
        this.lastCheckTimestamp = new Date();
      }
    } catch (error) {
      this.logger.error(`Error checking completions: ${error.message}`, error.stack);
    }
  }

  /**
   * Process a completed transcription and trigger combined summary
   */
  @Process({
    name: ML_RESULT_QUEUE.JOBS.PROCESS_TRANSCRIPTION,
    concurrency: 5,
  })
  async processTranscriptionComplete(job: Job<{
    shareId: string;
    transcriptionResult: TranscriptionResult;
    shareUrl: string;
    sharePlatform: string;
    shareTitle?: string;
  }>) {
    const { shareId, transcriptionResult } = job.data;
    this.logger.log(`Processing transcription completion for share ${shareId}`);

    try {
      // Get original caption and hashtags from metadata or shares
      const [shareData] = await this.db.database
        .select({
          title: shares.title,
          description: shares.description,
          platformData: shares.platformData,
        })
        .from(shares)
        .where(eq(shares.id, shareId))
        .limit(1);

      if (!shareData) {
        this.logger.warn(`No share data found for share ${shareId}`);
        return;
      }

      // Update workflow state to summarizing
      await this.db.database
        .update(shares)
        .set({ 
          workflowState: VideoWorkflowState.SUMMARIZING,
          updatedAt: new Date()
        })
        .where(eq(shares.id, shareId));

      // Prepare caption/text based on platform
      let caption = '';
      let hashtags: string[] = [];
      
      if (job.data.sharePlatform === 'reddit') {
        // For Reddit, combine title and selftext (description)
        caption = shareData.title || '';
        if (shareData.description) {
          caption = `${caption}\n\n${shareData.description}`;
        }
        this.logger.log(`Processing Reddit video with combined title and selftext for share ${shareId}`);
      } else {
        // For other platforms (TikTok, YouTube), use platformData
        caption = (shareData.platformData as any)?.caption || '';
        hashtags = (shareData.platformData as any)?.hashtags || [];
      }

      // Queue combined summary task
      await this.mlProducer.publishTask({
        version: '1.0',
        taskType: 'summarize_video_combined',
        shareId: shareId,
        payload: {
          transcript: transcriptionResult.transcript,
          caption: caption,
          hashtags: hashtags,
          platform: job.data.sharePlatform,
          title: job.data.shareTitle,
          url: job.data.shareUrl,
        },
        metadata: {
          correlationId: uuidv4(),
          timestamp: Date.now(),
          retryCount: 0,
        },
      });

      this.logger.log(`Queued combined summary for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Error processing transcription completion: ${error.message}`, error.stack);
      
      // Update workflow state to failed
      await this.db.database
        .update(shares)
        .set({ 
          workflowState: VideoWorkflowState.FAILED_TRANSCRIPTION,
          updatedAt: new Date()
        })
        .where(eq(shares.id, shareId));
    }
  }

  /**
   * Check for videos stuck in transcribing state
   */
  @Process({
    name: ML_RESULT_QUEUE.JOBS.CHECK_TIMEOUTS,
    concurrency: 1,
  })
  async checkTimeouts() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      // Find shares stuck in transcribing state for over 30 minutes
      const stuckShares = await this.db.database
        .select({
          id: shares.id,
          url: shares.url,
          enhancementStartedAt: shares.enhancementStartedAt,
        })
        .from(shares)
        .where(
          and(
            eq(shares.workflowState, VideoWorkflowState.TRANSCRIBING),
            gte(shares.enhancementStartedAt, thirtyMinutesAgo),
            isNull(shares.enhancementCompletedAt)
          )
        )
        .limit(10);

      for (const share of stuckShares) {
        this.logger.warn(`Share ${share.id} stuck in transcribing state for over 30 minutes`);
        
        // Get share data for fallback
        const [shareData] = await this.db.database
          .select({
            platform: shares.platform,
            title: shares.title,
            description: shares.description,
            platformData: shares.platformData,
          })
          .from(shares)
          .where(eq(shares.id, share.id))
          .limit(1);

        let fallbackText = '';
        
        if (shareData?.platform === 'reddit') {
          // For Reddit, use title and selftext
          fallbackText = shareData.title || '';
          if (shareData.description) {
            fallbackText = `${fallbackText}\n\n${shareData.description}`;
          }
        } else if ((shareData?.platformData as any)?.caption) {
          // For other platforms, use caption from platformData
          fallbackText = (shareData.platformData as any).caption;
        }

        if (fallbackText) {
          // Queue caption-only summary as fallback
          await this.mlProducer.publishSummarizationTask(
            share.id,
            {
              text: fallbackText,
              title: fallbackText.substring(0, 100),
              url: share.url,
              contentType: 'caption_fallback',
            },
            {
              style: 'brief',
              maxLength: 500,
            }
          );

          // Update state to indicate fallback
          await this.db.database
            .update(shares)
            .set({ 
              workflowState: VideoWorkflowState.FAILED_TRANSCRIPTION,
              updatedAt: new Date()
            })
            .where(eq(shares.id, share.id));
        }
      }
    } catch (error) {
      this.logger.error(`Error checking timeouts: ${error.message}`, error.stack);
    }
  }

  /**
   * Process completed video summary and update workflow
   */
  @Process({
    name: ML_RESULT_QUEUE.JOBS.PROCESS_SUMMARY,
    concurrency: 5,
  })
  async processSummaryComplete(job: Job<{
    shareId: string;
    summary: string;
    embedding: number[];
  }>) {
    const { shareId } = job.data;
    
    try {
      // Update workflow state to completed
      await this.db.database
        .update(shares)
        .set({ 
          workflowState: VideoWorkflowState.COMPLETED,
          enhancementCompletedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(shares.id, shareId));

      this.logger.log(`Video enhancement completed for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Error completing video enhancement: ${error.message}`, error.stack);
    }
  }
}