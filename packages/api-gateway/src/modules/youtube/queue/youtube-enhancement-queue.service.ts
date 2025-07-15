import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { YOUTUBE_ENHANCEMENT_QUEUE } from './youtube-enhancement-queue.constants';
import { YouTubeEnhancementData } from '../../shares/fetchers/types/youtube.types';

/**
 * Service for managing YouTube enhancement queue
 * Handles queueing of background enhancement jobs
 */
@Injectable()
export class YouTubeEnhancementQueue {
  private readonly logger = new Logger(YouTubeEnhancementQueue.name);

  constructor(
    @InjectQueue(YOUTUBE_ENHANCEMENT_QUEUE.NAME)
    private readonly enhancementQueue: Queue
  ) {}

  /**
   * Queue a YouTube video for background enhancement
   */
  async queueEnhancement(data: YouTubeEnhancementData): Promise<void> {
    const { shareId, processingStrategy } = data;
    
    try {
      // Add job with priority and timeout based on content type
      const job = await this.enhancementQueue.add(
        YOUTUBE_ENHANCEMENT_QUEUE.JOBS.ENHANCE_CONTENT,
        data,
        {
          priority: processingStrategy.processingPriority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000, // Start with 10s delay
          },
          timeout: this.getTimeoutForContentType(processingStrategy.type),
          removeOnComplete: {
            age: 24 * 60 * 60, // Keep completed jobs for 24 hours
            count: 100, // Keep last 100 completed jobs
          },
          removeOnFail: {
            age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
          },
        }
      );

      this.logger.log(
        `Queued YouTube enhancement job ${job.id} for share ${shareId} ` +
        `with priority ${processingStrategy.processingPriority} ` +
        `(type: ${processingStrategy.type})`
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue enhancement for share ${shareId}: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(shareId: string): Promise<{
    status: string;
    progress?: number;
    data?: any;
  }> {
    try {
      // Find jobs for this share
      const jobs = await this.enhancementQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
      const shareJobs = jobs.filter(job => job.data.shareId === shareId);
      
      if (shareJobs.length === 0) {
        return { status: 'not_found' };
      }

      const latestJob = shareJobs[shareJobs.length - 1];
      const state = await latestJob.getState();
      
      return {
        status: state,
        progress: latestJob.progress(),
        data: latestJob.data,
      };
    } catch (error) {
      this.logger.error(`Failed to get job status for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cancel enhancement job
   */
  async cancelEnhancement(shareId: string): Promise<boolean> {
    try {
      const jobs = await this.enhancementQueue.getJobs(['active', 'waiting']);
      const shareJobs = jobs.filter(job => job.data.shareId === shareId);
      
      for (const job of shareJobs) {
        await job.remove();
        this.logger.log(`Cancelled enhancement job ${job.id} for share ${shareId}`);
      }
      
      return shareJobs.length > 0;
    } catch (error) {
      this.logger.error(`Failed to cancel enhancement for share ${shareId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get queue metrics
   */
  async getQueueMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.enhancementQueue.getWaitingCount(),
      this.enhancementQueue.getActiveCount(),
      this.enhancementQueue.getCompletedCount(),
      this.enhancementQueue.getFailedCount(),
      this.enhancementQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Get timeout based on content type
   */
  private getTimeoutForContentType(contentType: string): number {
    switch (contentType) {
      case 'youtube_short':
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.SHORT;
      case 'youtube_standard':
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.STANDARD;
      case 'youtube_long':
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.LONG;
      case 'youtube_edu':
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.EDUCATIONAL;
      case 'youtube_music':
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.MUSIC;
      default:
        return YOUTUBE_ENHANCEMENT_QUEUE.TIMEOUTS.STANDARD;
    }
  }
}