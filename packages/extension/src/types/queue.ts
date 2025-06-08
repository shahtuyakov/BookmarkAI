/**
 * Queue-related types for browser extension offline storage
 * Maintains consistency with iOS SQLite and Android Room schemas
 */

export type QueueStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface QueueItem {
  id: string;              // ULID for cross-platform consistency
  url: string;             // Required bookmark URL
  title?: string | null;   // Optional title extracted from page
  notes?: string | null;   // Optional user notes
  createdAt: number;       // Unix timestamp in milliseconds
  status: QueueStatus;     // Current processing status
  retryCount: number;      // Number of retry attempts
  lastError?: string | null; // Error message for failed items
  updatedAt: number;       // Unix timestamp in milliseconds
  timestamp: number;       // Alias for createdAt (React Native compatibility)
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface QueueOperationResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Configuration for queue processing
 */
export interface QueueConfig {
  maxRetries: number;          // Maximum retry attempts before marking as failed
  retryDelayMs: number;        // Base delay between retries (exponential backoff)
  batchSize: number;           // Number of items to process in parallel
  cleanupIntervalHours: number; // How often to cleanup completed items
  completedItemRetentionDays: number; // How long to keep completed items
}

/**
 * Default queue configuration matching mobile platforms
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  batchSize: 5,
  cleanupIntervalHours: 24,
  completedItemRetentionDays: 7,
};