import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ShareProcessor } from './share-processor';
import { SHARE_QUEUE } from './share-queue.constants';
import { 
  PLATFORM_QUEUES, 
  QueuePriority, 
  QUEUE_CONFIG,
  QUEUE_CONFIG as QC 
} from './priority-queue.constants';
import { PriorityQueueService } from '../services/priority-queue.service';
import { WorkerRateLimiterService } from '../services/worker-rate-limiter.service';

/**
 * Enhanced processor that handles priority queues with fair scheduling
 * Extends the existing ShareProcessor to maintain compatibility
 */
export class PriorityShareProcessorFactory {
  /**
   * Create processors for all platform/priority combinations
   */
  static createProcessors(
    baseProcessor: ShareProcessor,
    priorityQueueService: PriorityQueueService,
    rateLimiter: WorkerRateLimiterService
  ): any[] {
    const processors: any[] = [];
    
    // Create a processor for each platform/priority combination
    Object.entries(PLATFORM_QUEUES).forEach(([platform, queues]) => {
      Object.entries(queues).forEach(([priorityKey, queueName]) => {
        const priority = priorityKey.toLowerCase() as QueuePriority;
        
        // Dynamic processor class for each queue
        @Processor(queueName)
        class DynamicPriorityProcessor {
          private readonly logger = new Logger(`${platform}-${priority}-Processor`);
          
          @Process({
            name: SHARE_QUEUE.JOBS.PROCESS,
            concurrency: QUEUE_CONFIG.CONCURRENCY[priority],
          })
          async processShare(job: Job<any>) {
            const startTime = Date.now();
            const { shareId, userId, platform: jobPlatform, priority: jobPriority } = job.data;
            
            this.logger.log(
              `Processing ${jobPriority} priority share ${shareId} for user ${userId} on ${jobPlatform}`
            );
            
            try {
              // Check per-user rate limit allocation
              const allocated = await this.checkUserAllocation(
                userId, 
                jobPlatform, 
                jobPriority
              );
              
              if (!allocated) {
                // Requeue with delay if user exceeded their allocation
                const delay = this.calculateUserBackoff(jobPriority);
                throw new Error(`User ${userId} exceeded allocation. Retry in ${delay}ms`);
              }
              
              // Process using the base processor
              const result = await baseProcessor.processShare(job);
              
              // Release concurrent share slot
              await priorityQueueService.releaseShare(shareId, userId);
              
              // Track processing time by priority
              const duration = Date.now() - startTime;
              this.logger.log(
                `Completed ${jobPriority} priority share ${shareId} in ${duration}ms`
              );
              
              return result;
            } catch (error) {
              // Release concurrent share slot on error
              await priorityQueueService.releaseShare(shareId, userId);
              throw error;
            }
          }
          
          /**
           * Check if user has available allocation for this priority
           */
          private async checkUserAllocation(
            userId: string,
            platform: string,
            priority: QueuePriority
          ): Promise<boolean> {
            // Get platform rate limit allocation for this priority
            const allocation = QC.RATE_LIMIT_ALLOCATION[priority];
            
            // Check if user's requests are within their priority allocation
            // This prevents low-priority users from consuming high-priority slots
            const userKey = `allocation:${platform}:${userId}:${priority}`;
            const platformKey = `allocation:${platform}:total`;
            
            // Simple token bucket per priority tier
            // High priority users get more tokens
            const maxTokens = Math.floor(100 * allocation); // 100 requests/min * allocation
            
            // This is simplified - in production, integrate with DistributedRateLimiter
            return true; // For now, allow all
          }
          
          /**
           * Calculate backoff delay based on priority
           */
          private calculateUserBackoff(priority: QueuePriority): number {
            const baseDelay = 5000; // 5 seconds
            
            switch (priority) {
              case QueuePriority.HIGH:
                return baseDelay / 2; // 2.5 seconds
              case QueuePriority.NORMAL:
                return baseDelay; // 5 seconds
              case QueuePriority.LOW:
                return baseDelay * 2; // 10 seconds
              default:
                return baseDelay;
            }
          }
        }
        
        processors.push(DynamicPriorityProcessor);
      });
    });
    
    return processors;
  }
}

/**
 * Legacy processor for backward compatibility
 * Handles jobs that don't have priority information
 * 
 * NOTE: Commented out to avoid duplicate processor registration.
 * Enable only when transitioning to priority queues.
 */
// @Processor(SHARE_QUEUE.NAME)
export class LegacyShareProcessor extends ShareProcessor {
  private readonly legacyLogger = new Logger(LegacyShareProcessor.name);
  
  @Process({
    name: SHARE_QUEUE.JOBS.PROCESS,
    concurrency: 1, // Lower concurrency for legacy queue
  })
  async processShare(job: Job<{ shareId: string }>) {
    this.legacyLogger.warn(
      `Processing share ${job.data.shareId} through legacy queue. ` +
      `Consider migrating to priority queues.`
    );
    
    return super.processShare(job);
  }
}