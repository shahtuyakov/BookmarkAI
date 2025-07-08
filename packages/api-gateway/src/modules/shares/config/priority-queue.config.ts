/**
 * Configuration for priority queue feature rollout
 */
export interface PriorityQueueConfig {
  // Master switch for priority queues
  enabled: boolean;
  
  // Rollout percentage (0-100)
  rolloutPercentage: number;
  
  // Specific user IDs to always use priority queues (beta testers)
  betaUserIds: string[];
  
  // Specific user IDs to never use priority queues (in case of issues)
  excludedUserIds: string[];
  
  // Enable monitoring mode (log but don't actually use priority queues)
  monitoringOnly: boolean;
  
  // Enable rebalancing cron job
  enableRebalancing: boolean;
  
  // Rebalancing interval in seconds
  rebalanceIntervalSeconds: number;
}

/**
 * Default configuration for priority queues
 */
export const DEFAULT_PRIORITY_QUEUE_CONFIG: PriorityQueueConfig = {
  enabled: false,
  rolloutPercentage: 0,
  betaUserIds: [],
  excludedUserIds: [],
  monitoringOnly: true,
  enableRebalancing: false,
  rebalanceIntervalSeconds: 300, // 5 minutes
};

/**
 * Helper to determine if a user should use priority queues
 */
export function shouldUsePriorityQueues(
  userId: string,
  config: PriorityQueueConfig
): boolean {
  // Check if feature is enabled
  if (!config.enabled) {
    return false;
  }
  
  // Check excluded users
  if (config.excludedUserIds.includes(userId)) {
    return false;
  }
  
  // Check beta users
  if (config.betaUserIds.includes(userId)) {
    return true;
  }
  
  // Check rollout percentage
  if (config.rolloutPercentage >= 100) {
    return true;
  }
  
  if (config.rolloutPercentage <= 0) {
    return false;
  }
  
  // Use consistent hashing for gradual rollout
  const hash = userId.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  const bucket = Math.abs(hash) % 100;
  return bucket < config.rolloutPercentage;
}