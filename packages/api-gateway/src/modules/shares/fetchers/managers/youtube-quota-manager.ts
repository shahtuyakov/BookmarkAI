import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../../../config/services/config.service';
import Redis from 'ioredis';
import { YouTubeQuotaStatus } from '../types/youtube.types';
import { YouTubeError } from '../errors/youtube.error';

/**
 * YouTube API quota management with Redis backing
 * Tracks and enforces daily quota limits to prevent API bans
 */
@Injectable()
export class YouTubeQuotaManager implements OnModuleInit {
  private readonly logger = new Logger(YouTubeQuotaManager.name);
  private readonly DAILY_QUOTA = 10000;
  private readonly OPERATION_COSTS = {
    'videos.list': 1,
    'channels.list': 1,
    'search.list': 100,
    'captions.list': 50,
    'captions.download': 200,
    'commentThreads.list': 1
  } as const;

  private readonly redis: Redis;

  constructor(
    private readonly configService: ConfigService
  ) {
    // Initialize Redis client using same pattern as rate limiter
    this.redis = new Redis({
      host: this.configService.get('CACHE_HOST', 'localhost'),
      port: this.configService.get('CACHE_PORT', 6379),
      password: this.configService.get('CACHE_PASSWORD', ''),
      db: this.configService.get('CACHE_YOUTUBE_DB', 3), // Use different DB for YouTube quota
      keyPrefix: 'yt:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 100,
    });
  }

  async onModuleInit() {
    try {
      await this.redis.ping();
      this.logger.log('Connected to Redis for YouTube quota management');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for YouTube quota', error);
    }
  }

  /**
   * Check if quota is available for an operation
   */
  async checkQuotaAvailable(
    operation: keyof typeof this.OPERATION_COSTS,
    requestCount: number = 1
  ): Promise<boolean> {
    const cost = this.OPERATION_COSTS[operation] * requestCount;
    const currentUsage = await this.getCurrentQuotaUsage();

    return (currentUsage + cost) <= this.DAILY_QUOTA;
  }

  /**
   * Record quota usage after an API call
   */
  async recordQuotaUsage(
    operation: keyof typeof this.OPERATION_COSTS,
    requestCount: number = 1
  ): Promise<void> {
    const cost = this.OPERATION_COSTS[operation] * requestCount;
    const key = this.getQuotaKey();

    // Increment usage with expiration at next midnight PST
    const usage = await this.redis.incrby(key, cost);
    await this.redis.expireat(key, this.getNextMidnightPST());

    // Log quota usage for monitoring
    this.logger.log({
      event: 'quota_usage',
      operation,
      cost,
      currentUsage: usage,
      remainingQuota: this.DAILY_QUOTA - usage,
      utilizationPercentage: ((usage / this.DAILY_QUOTA) * 100).toFixed(2)
    });

    // Alert if approaching limit
    if (usage > this.DAILY_QUOTA * 0.8) {
      this.logger.warn(
        `YouTube quota usage at ${usage}/${this.DAILY_QUOTA} ` +
        `(${((usage / this.DAILY_QUOTA) * 100).toFixed(1)}%)`
      );
    }

    // Throw error if quota exceeded
    if (usage > this.DAILY_QUOTA) {
      throw YouTubeError.quotaExceeded(usage, this.DAILY_QUOTA);
    }
  }

  /**
   * Get current quota usage
   */
  async getCurrentQuotaUsage(): Promise<number> {
    const key = this.getQuotaKey();
    const usage = await this.redis.get(key);
    return parseInt(usage || '0', 10);
  }

  /**
   * Get detailed quota status
   */
  async getQuotaStatus(): Promise<YouTubeQuotaStatus> {
    const usage = await this.getCurrentQuotaUsage();
    const remaining = Math.max(0, this.DAILY_QUOTA - usage);

    return {
      used: usage,
      limit: this.DAILY_QUOTA,
      remaining,
      utilizationPercentage: (usage / this.DAILY_QUOTA) * 100,
      resetTime: this.getNextMidnightPST(),
      isNearLimit: usage > this.DAILY_QUOTA * 0.8,
      isOverLimit: usage > this.DAILY_QUOTA
    };
  }

  /**
   * Check if request should be prioritized based on quota usage
   */
  async prioritizeRequest(
    _operation: keyof typeof this.OPERATION_COSTS,
    priority: number
  ): Promise<boolean> {
    const quotaStatus = await this.getQuotaStatus();

    // If quota is abundant, allow all requests
    if (quotaStatus.utilizationPercentage < 50) {
      return true;
    }

    // If quota is limited, only allow high-priority requests
    if (quotaStatus.utilizationPercentage > 80) {
      return priority >= 7; // Only high priority (7-10)
    }

    // Medium quota usage, allow medium+ priority
    return priority >= 5;
  }

  /**
   * Get estimated time until quota reset
   */
  async getTimeUntilReset(): Promise<number> {
    const resetTime = this.getNextMidnightPST();
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, resetTime - now);
  }

  /**
   * Predict quota usage for the day based on current rate
   */
  async predictDailyUsage(): Promise<{
    predicted: number;
    confidence: 'low' | 'medium' | 'high';
    willExceedQuota: boolean;
  }> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    
    const hoursElapsed = (now.getTime() - startOfDay.getTime()) / (1000 * 60 * 60);
    const currentUsage = await this.getCurrentQuotaUsage();

    if (hoursElapsed < 1) {
      // Too early to predict
      return {
        predicted: currentUsage,
        confidence: 'low',
        willExceedQuota: false
      };
    }

    const hourlyRate = currentUsage / hoursElapsed;
    const predicted = hourlyRate * 24;
    
    // Confidence based on how much data we have
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (hoursElapsed > 12) confidence = 'high';
    else if (hoursElapsed > 6) confidence = 'medium';

    return {
      predicted: Math.round(predicted),
      confidence,
      willExceedQuota: predicted > this.DAILY_QUOTA
    };
  }

  /**
   * Force reset quota (admin function, use with caution)
   */
  async resetQuota(): Promise<void> {
    const key = this.getQuotaKey();
    await this.redis.del(key);
    this.logger.warn('YouTube quota manually reset');
  }

  /**
   * Get Redis key for today's quota
   */
  private getQuotaKey(): string {
    const today = new Date().toISOString().split('T')[0];
    return `youtube_quota:${today}`;
  }

  /**
   * Get next midnight PST as Unix timestamp
   * YouTube quota resets at midnight Pacific Time
   */
  private getNextMidnightPST(): number {
    const now = new Date();
    const pstOffset = -8 * 60; // PST is UTC-8
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Next midnight
    midnight.setMinutes(midnight.getMinutes() + pstOffset);
    return Math.floor(midnight.getTime() / 1000);
  }

  /**
   * Get operation cost for planning
   */
  getOperationCost(operation: keyof typeof this.OPERATION_COSTS): number {
    return this.OPERATION_COSTS[operation];
  }

  /**
   * Batch check quota for multiple operations
   */
  async checkBatchQuotaAvailable(
    operations: Array<{
      operation: keyof typeof this.OPERATION_COSTS;
      count: number;
    }>
  ): Promise<boolean> {
    const totalCost = operations.reduce(
      (sum, op) => sum + (this.OPERATION_COSTS[op.operation] * op.count),
      0
    );
    
    const currentUsage = await this.getCurrentQuotaUsage();
    return (currentUsage + totalCost) <= this.DAILY_QUOTA;
  }
}