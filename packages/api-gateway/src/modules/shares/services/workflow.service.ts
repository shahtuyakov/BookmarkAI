import { Injectable, Logger } from '@nestjs/common';
import { SharesRepository } from '../repositories/shares.repository';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WorkflowMetricsService } from './workflow-metrics.service';

export enum WorkflowState {
  PENDING = 'pending',
  TRANSCRIBING = 'transcribing',
  SUMMARIZING = 'summarizing',
  CAPTIONING = 'captioning',
  EMBEDDING = 'embedding',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Service for managing share enhancement workflows
 */
@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly sharesRepository: SharesRepository,
    private readonly metricsService: WorkflowMetricsService,
  ) {}

  /**
   * Start the transcription workflow for a share
   */
  async startTranscription(shareId: string): Promise<void> {
    try {
      await this.sharesRepository.startEnhancement(shareId, WorkflowState.TRANSCRIBING);
      this.metricsService.recordWorkflowTransition(WorkflowState.PENDING, WorkflowState.TRANSCRIBING);
      this.logger.log(`Started transcription workflow for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to start transcription for share ${shareId}`, error);
      throw error;
    }
  }

  /**
   * Update workflow state to summarizing
   */
  async startSummarization(shareId: string): Promise<void> {
    try {
      await this.sharesRepository.updateWorkflowState(shareId, WorkflowState.SUMMARIZING);
      this.metricsService.recordWorkflowTransition(WorkflowState.TRANSCRIBING, WorkflowState.SUMMARIZING);
      this.logger.log(`Started summarization workflow for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to start summarization for share ${shareId}`, error);
      throw error;
    }
  }

  /**
   * Update workflow state to captioning
   */
  async startCaptioning(shareId: string): Promise<void> {
    try {
      await this.sharesRepository.updateWorkflowState(shareId, WorkflowState.CAPTIONING);
      this.logger.log(`Started captioning workflow for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to start captioning for share ${shareId}`, error);
      throw error;
    }
  }

  /**
   * Update workflow state to embedding
   */
  async startEmbedding(shareId: string): Promise<void> {
    try {
      await this.sharesRepository.updateWorkflowState(shareId, WorkflowState.EMBEDDING);
      this.logger.log(`Started embedding workflow for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to start embedding for share ${shareId}`, error);
      throw error;
    }
  }

  /**
   * Complete the enhancement workflow
   */
  async completeWorkflow(shareId: string): Promise<void> {
    try {
      await this.sharesRepository.completeEnhancement(shareId, WorkflowState.COMPLETED);
      this.metricsService.recordWorkflowTransition(WorkflowState.SUMMARIZING, WorkflowState.COMPLETED);
      this.logger.log(`Completed enhancement workflow for share ${shareId}`);
    } catch (error) {
      this.logger.error(`Failed to complete workflow for share ${shareId}`, error);
      throw error;
    }
  }

  /**
   * Mark workflow as failed
   */
  async failWorkflow(shareId: string, error?: string): Promise<void> {
    try {
      // Get current state before failing
      const share = await this.sharesRepository.findById(shareId);
      const fromState = share?.workflowState || WorkflowState.PENDING;
      
      await this.sharesRepository.updateWorkflowState(shareId, WorkflowState.FAILED, {
        enhancementCompletedAt: new Date(),
      });
      
      this.metricsService.recordWorkflowTransition(fromState, WorkflowState.FAILED);
      this.logger.error(`Failed enhancement workflow for share ${shareId}: ${error || 'Unknown error'}`);
    } catch (err) {
      this.logger.error(`Failed to update workflow state to failed for share ${shareId}`, err);
      throw err;
    }
  }

  /**
   * Get shares ready for enhancement
   */
  async getSharesForEnhancement(limit: number = 10) {
    return await this.sharesRepository.findReadyForEnhancement(limit);
  }

  /**
   * Get shares in a specific workflow state
   */
  async getSharesByWorkflowState(state: WorkflowState, limit?: number) {
    return await this.sharesRepository.findByWorkflowState(state, limit);
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(userId?: string) {
    return await this.sharesRepository.getWorkflowStateStats(userId);
  }

  /**
   * Batch update workflow states (useful for bulk operations)
   */
  async batchUpdateWorkflowStates(shareIds: string[], state: WorkflowState) {
    try {
      const updated = await this.sharesRepository.batchUpdateWorkflowStates(shareIds, state);
      this.logger.log(`Batch updated ${updated.length} shares to workflow state ${state}`);
      return updated;
    } catch (error) {
      this.logger.error(`Failed to batch update workflow states`, error);
      throw error;
    }
  }

  /**
   * Update workflow metrics (runs periodically)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async updateWorkflowMetrics() {
    try {
      // Get current workflow state stats
      const stats = await this.getWorkflowStats();
      this.metricsService.updateWorkflowStateGauge(stats);
    } catch (error) {
      this.logger.error('Failed to update workflow metrics', error);
    }
  }

  /**
   * Clean up stale enhancements (runs periodically)
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async cleanupStaleEnhancements() {
    try {
      this.logger.log('Starting cleanup of stale enhancements');
      
      const staleShares = await this.sharesRepository.findStaleEnhancements(30);
      
      if (staleShares.length > 0) {
        const shareIds = staleShares.map(share => share.id);
        
        // Record stuck workflow metrics
        for (const share of staleShares) {
          if (share.enhancementStartedAt) {
            const durationMinutes = (Date.now() - share.enhancementStartedAt.getTime()) / 1000 / 60;
            this.metricsService.recordStuckWorkflow(share.workflowState || 'unknown', durationMinutes);
          }
        }
        
        await this.batchUpdateWorkflowStates(shareIds, WorkflowState.FAILED);
        
        this.logger.warn(`Marked ${staleShares.length} stale enhancements as failed`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stale enhancements', error);
    }
  }

  /**
   * Retry failed workflows
   */
  async retryFailedWorkflows(limit: number = 10) {
    try {
      const failedShares = await this.sharesRepository.findByWorkflowState(WorkflowState.FAILED, limit);
      
      for (const share of failedShares) {
        await this.sharesRepository.updateWorkflowState(share.id, WorkflowState.PENDING, {
          enhancementStartedAt: null,
          enhancementCompletedAt: null,
        });
      }
      
      this.logger.log(`Reset ${failedShares.length} failed workflows to pending`);
      return failedShares.length;
    } catch (error) {
      this.logger.error('Failed to retry failed workflows', error);
      throw error;
    }
  }
}