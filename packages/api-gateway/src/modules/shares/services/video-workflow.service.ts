import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { MLProducerEnhancedService } from '../../ml/ml-producer-enhanced.service';
import { VideoWorkflowState } from '../../../shares/types/workflow.types';
import { eq, and, isNotNull } from 'drizzle-orm';
import { shares } from '../../../db/schema/shares';
import { mlResults } from '../../../db/schema/ml-results';

interface TranscriptionResult {
  text: string;
  duration?: number;
  language?: string;
}

/**
 * Service for managing video workflow state transitions
 * Runs periodically to check for completed ML tasks and transition workflow states
 */
@Injectable()
export class VideoWorkflowService {
  private readonly logger = new Logger(VideoWorkflowService.name);

  constructor(
    private readonly db: DrizzleService,
    private readonly mlProducer: MLProducerEnhancedService,
  ) {}

  /**
   * Check for completed transcriptions and transition to summarizing
   * Runs every 30 seconds
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processVideoWorkflowTransitions() {
    try {
      await this.processTranscriptionCompletions();
      await this.processSummarizationCompletions();
    } catch (error) {
      this.logger.error(`Error processing video workflow transitions: ${error.message}`, error.stack);
    }
  }

  /**
   * Find videos that completed transcription and need to start summarization
   */
  private async processTranscriptionCompletions() {
    try {
      // Find shares in 'video_transcribing' state with completed transcriptions
      const completedTranscriptions = await this.db.database
        .select({
          shareId: shares.id,
          shareUrl: shares.url,
          sharePlatform: shares.platform,
          shareTitle: shares.title,
          platformData: shares.platformData,
          transcriptionResult: mlResults.resultData,
        })
        .from(shares)
        .innerJoin(mlResults, eq(mlResults.shareId, shares.id))
        .where(
          and(
            eq(shares.workflowState, VideoWorkflowState.TRANSCRIBING),
            eq(mlResults.taskType, 'transcription'),
            isNotNull(mlResults.resultData)
          )
        )
        .limit(10); // Process max 10 at a time

      for (const completion of completedTranscriptions) {
        await this.transitionToSummarizing(completion);
      }

      if (completedTranscriptions.length > 0) {
        this.logger.log(`Processed ${completedTranscriptions.length} transcription completions`);
      }
    } catch (error) {
      this.logger.error(`Error processing transcription completions: ${error.message}`, error.stack);
    }
  }

  /**
   * Find videos that completed summarization and mark as completed
   */
  private async processSummarizationCompletions() {
    try {
      // Find shares in 'video_summarizing' state with completed summaries
      const completedSummarizations = await this.db.database
        .select({
          shareId: shares.id,
        })
        .from(shares)
        .innerJoin(mlResults, eq(mlResults.shareId, shares.id))
        .where(
          and(
            eq(shares.workflowState, VideoWorkflowState.SUMMARIZING),
            eq(mlResults.taskType, 'summarize_llm'),
            isNotNull(mlResults.resultData)
          )
        )
        .limit(10); // Process max 10 at a time

      for (const completion of completedSummarizations) {
        await this.transitionToCompleted(completion.shareId);
      }

      if (completedSummarizations.length > 0) {
        this.logger.log(`Processed ${completedSummarizations.length} summarization completions`);
      }
    } catch (error) {
      this.logger.error(`Error processing summarization completions: ${error.message}`, error.stack);
    }
  }

  /**
   * Transition a share from transcribing to summarizing and queue combined summary
   */
  private async transitionToSummarizing(completion: {
    shareId: string;
    shareUrl: string;
    sharePlatform: string;
    shareTitle: string;
    platformData: any;
    transcriptionResult: any;
  }) {
    try {
      const { shareId, shareUrl, shareTitle, platformData, transcriptionResult } = completion;

      // Update workflow state to summarizing
      await this.db.database
        .update(shares)
        .set({ 
          workflowState: VideoWorkflowState.SUMMARIZING,
          updatedAt: new Date()
        })
        .where(eq(shares.id, shareId));

      // Queue combined summary task using transcript + caption
      const transcriptText = (transcriptionResult as TranscriptionResult).text;
      const caption = (platformData as any)?.caption || shareTitle || '';
      const hashtags = ((platformData as any)?.hashtags || []).join(', ');
      
      const combinedText = [
        shareTitle ? `Title: ${shareTitle}` : '',
        caption ? `Caption: ${caption}` : '',
        transcriptText ? `Transcript: ${transcriptText}` : '',
        hashtags ? `Hashtags: ${hashtags}` : '',
      ].filter(Boolean).join('\n\n');

      this.logger.log(`Combined text for share ${shareId} (${combinedText.length} chars): ${combinedText.substring(0, 200)}...`);

      await this.mlProducer.publishSummarizationTask(shareId, {
        text: combinedText,
        title: shareTitle,
        url: shareUrl,
        contentType: 'video_combined',
      });

      // Also queue enhanced embedding task with transcript content
      if (transcriptText) {
        await this.mlProducer.publishEmbeddingTask(shareId, {
          text: combinedText,
          type: 'transcript',
          metadata: {
            title: shareTitle,
            url: shareUrl,
            platform: completion.sharePlatform,
            hasTranscript: true,
            isEnhancedEmbedding: true,
          }
        }, {
          embeddingType: 'content',
        });
        this.logger.log(`Queued enhanced transcript embedding for share ${shareId}`);
      }

      this.logger.log(`Transitioned share ${shareId} to summarizing and queued combined summary`);
    } catch (error) {
      this.logger.error(`Error transitioning share ${completion.shareId} to summarizing: ${error.message}`, error.stack);
      
      // Update workflow state to failed on error
      await this.db.database
        .update(shares)
        .set({ 
          workflowState: VideoWorkflowState.FAILED_TRANSCRIPTION,
          updatedAt: new Date()
        })
        .where(eq(shares.id, completion.shareId));
    }
  }

  /**
   * Transition a share to completed state
   */
  private async transitionToCompleted(shareId: string) {
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
      this.logger.error(`Error completing video enhancement for share ${shareId}: ${error.message}`, error.stack);
    }
  }

  /**
   * Get workflow statistics for monitoring
   */
  async getWorkflowStats() {
    try {
      const stats = await this.db.database
        .select({
          workflowState: shares.workflowState,
        })
        .from(shares)
        .where(isNotNull(shares.workflowState));

      const counts = stats.reduce((acc, share) => {
        const state = share.workflowState || 'unknown';
        acc[state] = (acc[state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return counts;
    } catch (error) {
      this.logger.error(`Error getting workflow stats: ${error.message}`, error.stack);
      return {};
    }
  }
}