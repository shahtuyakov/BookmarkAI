/**
 * Priority queue constants for fair share processing
 * Implements per-platform and per-priority queues to solve global rate limiting issues
 */

export enum QueuePriority {
  HIGH = 'high',
  NORMAL = 'normal',
  LOW = 'low',
}

export enum UserTier {
  PREMIUM = 'premium',
  STANDARD = 'standard',
  FREE = 'free',
}

/**
 * Map user tiers to queue priorities
 */
export const TIER_TO_PRIORITY: Record<UserTier, QueuePriority> = {
  [UserTier.PREMIUM]: QueuePriority.HIGH,
  [UserTier.STANDARD]: QueuePriority.NORMAL,
  [UserTier.FREE]: QueuePriority.LOW,
};

/**
 * Platform-specific queue names
 * Format: share.{platform}.{priority}
 */
export const PLATFORM_QUEUES = {
  TIKTOK: {
    HIGH: 'share.tiktok.high',
    NORMAL: 'share.tiktok.normal',
    LOW: 'share.tiktok.low',
  },
  REDDIT: {
    HIGH: 'share.reddit.high',
    NORMAL: 'share.reddit.normal',
    LOW: 'share.reddit.low',
  },
  TWITTER: {
    HIGH: 'share.twitter.high',
    NORMAL: 'share.twitter.normal',
    LOW: 'share.twitter.low',
  },
  YOUTUBE: {
    HIGH: 'share.youtube.high',
    NORMAL: 'share.youtube.normal',
    LOW: 'share.youtube.low',
  },
  GENERIC: {
    HIGH: 'share.generic.high',
    NORMAL: 'share.generic.normal',
    LOW: 'share.generic.low',
  },
};

/**
 * Queue processing configuration
 */
export const QUEUE_CONFIG = {
  // Concurrency per queue (can be adjusted based on rate limits)
  CONCURRENCY: {
    [QueuePriority.HIGH]: 3,
    [QueuePriority.NORMAL]: 2,
    [QueuePriority.LOW]: 1,
  },
  
  // Processing weight for fair scheduling
  // High priority gets 3x more processing time than low
  WEIGHT: {
    [QueuePriority.HIGH]: 3,
    [QueuePriority.NORMAL]: 2,
    [QueuePriority.LOW]: 1,
  },
  
  // Rate limit allocation percentage per priority
  // Premium users get larger share of rate limit pool
  RATE_LIMIT_ALLOCATION: {
    [QueuePriority.HIGH]: 0.5,    // 50% of rate limit
    [QueuePriority.NORMAL]: 0.35, // 35% of rate limit
    [QueuePriority.LOW]: 0.15,    // 15% of rate limit
  },
};

/**
 * Per-user rate limiting configuration
 */
export const USER_RATE_LIMITS = {
  // Max shares per minute per user
  SHARES_PER_MINUTE: {
    [UserTier.PREMIUM]: 10,
    [UserTier.STANDARD]: 5,
    [UserTier.FREE]: 2,
  },
  
  // Max concurrent shares per user
  CONCURRENT_SHARES: {
    [UserTier.PREMIUM]: 5,
    [UserTier.STANDARD]: 3,
    [UserTier.FREE]: 1,
  },
};

/**
 * Helper to get queue name for a platform and priority
 */
export function getQueueName(platform: string, priority: QueuePriority): string {
  const platformUpper = platform.toUpperCase();
  const platformQueues = PLATFORM_QUEUES[platformUpper] || PLATFORM_QUEUES.GENERIC;
  return platformQueues[priority.toUpperCase()];
}

/**
 * Get all queue names for registration
 */
export function getAllQueueNames(): string[] {
  const queues: string[] = [];
  
  Object.values(PLATFORM_QUEUES).forEach(platformQueues => {
    Object.values(platformQueues).forEach(queueName => {
      queues.push(queueName);
    });
  });
  
  return queues;
}