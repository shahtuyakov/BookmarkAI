import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '../../../config/services/config.service';
import { 
  QueuePriority, 
  UserTier, 
  TIER_TO_PRIORITY,
  USER_RATE_LIMITS,
  getQueueName,
  getAllQueueNames,
  QUEUE_CONFIG,
} from '../queue/priority-queue.constants';
import { SHARE_QUEUE } from '../queue/share-queue.constants';
import { Platform } from '../constants/platform.enum';
import Redis from 'ioredis';

interface UserInfo {
  userId: string;
  tier: UserTier;
}

interface ShareJobData {
  shareId: string;
  userId: string;
  platform: string;
  priority: QueuePriority;
  enqueuedAt: Date;
}

/**
 * Service to manage priority-based queue routing and fair scheduling
 * Solves the global rate limiting problem by implementing per-user fairness
 */
@Injectable()
export class PriorityQueueService {
  private readonly logger = new Logger(PriorityQueueService.name);
  private readonly queues: Map<string, Queue> = new Map();
  private readonly redis: Redis;
  
  constructor(
    private readonly configService: ConfigService,
  ) {
    // Initialize Redis client for per-user tracking
    this.redis = new Redis({
      host: this.configService.get('CACHE_HOST', 'localhost'),
      port: this.configService.get('CACHE_PORT', 6379),
    });
  }
  
  /**
   * Register a queue instance
   * Called during module initialization for each platform/priority combination
   */
  registerQueue(queueName: string, queue: Queue): void {
    this.queues.set(queueName, queue);
    this.logger.log(`Registered queue: ${queueName}`);
  }
  
  /**
   * Get user tier from database or service
   * TODO: Integrate with actual user service
   */
  private async getUserTier(userId: string): Promise<UserTier> {
    // For now, return standard tier
    // In production, this would query user subscription status
    return UserTier.STANDARD;
  }
  
  /**
   * Check if user has exceeded their rate limit
   */
  private async checkUserRateLimit(userId: string, tier: UserTier): Promise<boolean> {
    const key = `user_rate_limit:${userId}`;
    const limit = USER_RATE_LIMITS.SHARES_PER_MINUTE[tier];
    
    // Use sliding window counter
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Remove old entries
    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current entries
    const count = await this.redis.zcard(key);
    
    if (count >= limit) {
      this.logger.warn(`User ${userId} exceeded rate limit: ${count}/${limit}`);
      return false;
    }
    
    // Add new entry
    await this.redis.zadd(key, now, `${now}`);
    await this.redis.expire(key, 60);
    
    return true;
  }
  
  /**
   * Check concurrent shares for user
   */
  private async checkConcurrentShares(userId: string, tier: UserTier): Promise<boolean> {
    const key = `user_concurrent:${userId}`;
    const limit = USER_RATE_LIMITS.CONCURRENT_SHARES[tier];
    
    const count = await this.redis.scard(key);
    
    if (count >= limit) {
      this.logger.warn(`User ${userId} exceeded concurrent limit: ${count}/${limit}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Add a share to the appropriate priority queue
   */
  async queueShare(
    shareId: string,
    userId: string,
    platform: Platform,
    shareData?: any
  ): Promise<void> {
    // Get user tier
    const tier = await this.getUserTier(userId);
    const priority = TIER_TO_PRIORITY[tier];
    
    // Check user rate limits
    const withinRateLimit = await this.checkUserRateLimit(userId, tier);
    if (!withinRateLimit) {
      throw new Error('User rate limit exceeded. Please try again later.');
    }
    
    const withinConcurrentLimit = await this.checkConcurrentShares(userId, tier);
    if (!withinConcurrentLimit) {
      throw new Error('Too many concurrent shares. Please wait for existing shares to complete.');
    }
    
    // Get appropriate queue
    const queueName = getQueueName(platform, priority);
    const queue = this.queues.get(queueName);
    
    if (!queue) {
      this.logger.error(`Queue not found: ${queueName}`);
      // Fallback to legacy queue
      const legacyQueue = this.queues.get(SHARE_QUEUE.NAME);
      if (legacyQueue) {
        await legacyQueue.add(
          SHARE_QUEUE.JOBS.PROCESS,
          { shareId },
          this.getJobOptions(priority)
        );
        return;
      }
      throw new Error(`Queue not initialized: ${queueName}`);
    }
    
    // Add to concurrent shares set
    await this.redis.sadd(`user_concurrent:${userId}`, shareId);
    await this.redis.expire(`user_concurrent:${userId}`, 3600); // 1 hour TTL
    
    // Queue the job with enhanced data
    const jobData: ShareJobData = {
      shareId,
      userId,
      platform,
      priority,
      enqueuedAt: new Date(),
    };
    
    await queue.add(
      SHARE_QUEUE.JOBS.PROCESS,
      jobData,
      this.getJobOptions(priority)
    );
    
    this.logger.log(`Queued share ${shareId} to ${queueName} for user ${userId} (${tier})`);
    
    // Track queue depth metrics
    await this.updateQueueMetrics(queueName, platform, priority);
  }
  
  /**
   * Remove share from concurrent set when completed
   */
  async releaseShare(shareId: string, userId: string): Promise<void> {
    await this.redis.srem(`user_concurrent:${userId}`, shareId);
  }
  
  /**
   * Get job options based on priority
   */
  private getJobOptions(priority: QueuePriority) {
    return {
      attempts: priority === QueuePriority.HIGH ? 5 : 3,
      backoff: {
        type: 'exponential' as const,
        delay: priority === QueuePriority.HIGH ? 2000 : 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    };
  }
  
  /**
   * Update queue depth metrics for monitoring
   */
  private async updateQueueMetrics(
    queueName: string,
    platform: string,
    priority: QueuePriority
  ): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) return;
    
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);
    
    // Log for now, integrate with Prometheus metrics later
    this.logger.debug(`Queue ${queueName} - Waiting: ${waiting}, Active: ${active}, Delayed: ${delayed}`);
  }
  
  /**
   * Get queue statistics for all queues
   */
  async getQueueStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    
    for (const [name, queue] of this.queues) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      
      stats[name] = {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + delayed,
      };
    }
    
    return stats;
  }
  
  /**
   * Rebalance queues if needed (called periodically)
   * This ensures fair processing across priorities
   */
  async rebalanceQueues(): Promise<void> {
    // Get queue depths
    const depths: Record<string, number> = {};
    
    for (const [name, queue] of this.queues) {
      depths[name] = await queue.getWaitingCount();
    }
    
    // Log imbalances
    const platforms = ['tiktok', 'reddit', 'twitter', 'youtube'];
    
    for (const platform of platforms) {
      const high = depths[`share.${platform}.high`] || 0;
      const normal = depths[`share.${platform}.normal`] || 0;
      const low = depths[`share.${platform}.low`] || 0;
      
      if (low > high * 10) {
        this.logger.warn(
          `Queue imbalance for ${platform}: High=${high}, Normal=${normal}, Low=${low}`
        );
      }
    }
  }
}