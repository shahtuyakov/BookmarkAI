import { IndexedDBQueueAdapter } from '../adapters/indexeddb-queue.adapter';
import { QueueItem, QueueStats, QueueConfig, DEFAULT_QUEUE_CONFIG, QueueOperationResult } from '../types/queue';
import { sdkClient } from '../sdk/client';
import { errorLogger } from './error-logger';

/**
 * WebExtension Queue Manager Service
 * Manages offline bookmark queue with batch processing and sync capabilities
 * Maintains consistency with iOS SQLite and Android Room queue implementations
 */
export class QueueManagerService {
  private static instance: QueueManagerService | null = null;
  private queueAdapter: IndexedDBQueueAdapter;
  private config: QueueConfig;
  private processingActive: boolean = false;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private networkStatus: boolean = navigator.onLine;

  constructor(config: QueueConfig = DEFAULT_QUEUE_CONFIG) {
    this.queueAdapter = new IndexedDBQueueAdapter();
    this.config = config;
    this.initializeNetworkMonitoring();
    this.schedulePeriodicCleanup();
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: QueueConfig): QueueManagerService {
    if (!QueueManagerService.instance) {
      QueueManagerService.instance = new QueueManagerService(config);
    }
    return QueueManagerService.instance;
  }

  /**
   * Initialize network status monitoring
   */
  private initializeNetworkMonitoring(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('QueueManagerService: Network is online');
      this.networkStatus = true;
      this.processQueueWhenOnline();
    });

    window.addEventListener('offline', () => {
      console.log('QueueManagerService: Network is offline');
      this.networkStatus = false;
    });

    // Initial network check
    this.networkStatus = navigator.onLine;
    console.log('QueueManagerService: Initial network status:', this.networkStatus);
  }

  /**
   * Schedule periodic cleanup of completed items
   */
  private schedulePeriodicCleanup(): void {
    // Clear existing timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Schedule cleanup every X hours
    const intervalMs = this.config.cleanupIntervalHours * 60 * 60 * 1000;
    this.cleanupTimer = setInterval(() => {
      this.cleanupCompletedItems().catch(error => {
        console.error('QueueManagerService: Periodic cleanup failed:', error);
      });
    }, intervalMs);

    console.log(`QueueManagerService: Scheduled periodic cleanup every ${this.config.cleanupIntervalHours} hours`);
  }

  /**
   * Add a bookmark to the offline queue
   */
  async addToQueue(url: string, title?: string, notes?: string): Promise<QueueOperationResult> {
    try {
      console.log('QueueManagerService: Adding to queue:', { url, title, notes });

      const queueItem = await this.queueAdapter.addToQueue(url, title, notes);
      
      // If online, immediately try to process this item
      if (this.networkStatus) {
        // Process asynchronously without blocking the add operation
        this.processSingleItem(queueItem.id).catch(error => {
          console.error('QueueManagerService: Async processing failed for new item:', error);
        });
      }

      return {
        success: true,
        data: queueItem
      };
    } catch (error: any) {
      console.error('QueueManagerService: Failed to add to queue:', error);
      await errorLogger.logError('GENERAL', url, error.message || 'Failed to add to queue', {
        operation: 'addToQueue',
        url,
        title,
        notes
      });

      return {
        success: false,
        error: error.message || 'Failed to add to queue'
      };
    }
  }

  /**
   * Process all pending items in the queue
   */
  async processQueue(): Promise<QueueOperationResult> {
    if (this.processingActive) {
      console.log('QueueManagerService: Queue processing already in progress');
      return { success: true, data: { message: 'Processing already in progress' } };
    }

    if (!this.networkStatus) {
      console.log('QueueManagerService: Cannot process queue - network is offline');
      return { success: false, error: 'Network is offline' };
    }

    try {
      this.processingActive = true;
      console.log('QueueManagerService: Starting queue processing');

      const pendingItems = await this.queueAdapter.getPendingItems();
      console.log(`QueueManagerService: Found ${pendingItems.length} pending items`);

      if (pendingItems.length === 0) {
        return { success: true, data: { processed: 0, message: 'No items to process' } };
      }

      let processed = 0;
      let failed = 0;

      // Process items in batches to avoid overwhelming the API
      for (let i = 0; i < pendingItems.length; i += this.config.batchSize) {
        const batch = pendingItems.slice(i, i + this.config.batchSize);
        console.log(`QueueManagerService: Processing batch ${Math.floor(i / this.config.batchSize) + 1} (${batch.length} items)`);

        // Process batch items in parallel
        const batchPromises = batch.map(item => this.processSingleItem(item.id));
        const batchResults = await Promise.allSettled(batchPromises);

        // Count results
        batchResults.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            processed++;
          } else {
            failed++;
          }
        });

        // Add delay between batches to be respectful to the API
        if (i + this.config.batchSize < pendingItems.length) {
          await this.delay(1000);
        }
      }

      console.log(`QueueManagerService: Queue processing completed - processed: ${processed}, failed: ${failed}`);

      return {
        success: true,
        data: { processed, failed, total: pendingItems.length }
      };
    } catch (error: any) {
      console.error('QueueManagerService: Queue processing failed:', error);
      await errorLogger.logError('GENERAL', 'processQueue', error.message || 'Queue processing failed', {
        operation: 'processQueue'
      });

      return {
        success: false,
        error: error.message || 'Queue processing failed'
      };
    } finally {
      this.processingActive = false;
    }
  }

  /**
   * Process a single queue item
   */
  private async processSingleItem(itemId: string): Promise<QueueOperationResult> {
    try {
      // Get the item from queue
      const allItems = await this.queueAdapter.getAllItems();
      const item = allItems.find(i => i.id === itemId);

      if (!item) {
        return { success: false, error: 'Item not found in queue' };
      }

      if (item.status !== 'pending') {
        return { success: false, error: `Item status is ${item.status}, not pending` };
      }

      // Update status to processing
      await this.queueAdapter.updateItemStatus(itemId, 'processing');

      console.log(`QueueManagerService: Processing item ${itemId}: ${item.url}`);

      // Create share using SDK
      const shareResult = await errorLogger.wrapSDKCall(
        () => sdkClient.shares.create({
          url: item.url,
          title: item.title || undefined,
          // Note: SDK doesn't support notes field yet, could be added to metadata
        }),
        'QUEUE_PROCESS_ITEM'
      );

      if (shareResult) {
        // Success - mark as completed
        await this.queueAdapter.updateItemStatus(itemId, 'completed');
        console.log(`QueueManagerService: Successfully processed item ${itemId}`);

        return {
          success: true,
          data: { item, shareResult }
        };
      } else {
        throw new Error('SDK returned null result');
      }
    } catch (error: any) {
      console.error(`QueueManagerService: Failed to process item ${itemId}:`, error);

      try {
        // Update status to failed with error message
        await this.queueAdapter.updateItemStatus(itemId, 'failed', error.message || 'Processing failed');
      } catch (updateError) {
        console.error(`QueueManagerService: Failed to update item status to failed:`, updateError);
      }

      return {
        success: false,
        error: error.message || 'Processing failed'
      };
    }
  }

  /**
   * Automatically process queue when network comes online
   */
  private async processQueueWhenOnline(): Promise<void> {
    // Small delay to ensure network is stable
    await this.delay(2000);
    
    try {
      const result = await this.processQueue();
      console.log('QueueManagerService: Auto-processing result:', result);
    } catch (error) {
      console.error('QueueManagerService: Auto-processing failed:', error);
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<QueueStats> {
    try {
      return await this.queueAdapter.getQueueStats();
    } catch (error) {
      console.error('QueueManagerService: Failed to get queue stats:', error);
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      };
    }
  }

  /**
   * Get all items in the queue
   */
  async getAllQueueItems(): Promise<QueueItem[]> {
    try {
      return await this.queueAdapter.getAllItems();
    } catch (error) {
      console.error('QueueManagerService: Failed to get all queue items:', error);
      return [];
    }
  }

  /**
   * Get pending items in the queue
   */
  async getPendingItems(): Promise<QueueItem[]> {
    try {
      return await this.queueAdapter.getPendingItems();
    } catch (error) {
      console.error('QueueManagerService: Failed to get pending items:', error);
      return [];
    }
  }

  /**
   * Retry all failed items
   */
  async retryFailedItems(): Promise<QueueOperationResult> {
    try {
      const retryCount = await this.queueAdapter.retryFailedItems();
      console.log(`QueueManagerService: Reset ${retryCount} failed items for retry`);

      // If online, process the retry items immediately
      if (this.networkStatus && retryCount > 0) {
        setTimeout(() => {
          this.processQueue().catch(error => {
            console.error('QueueManagerService: Failed to process retry items:', error);
          });
        }, 1000);
      }

      return {
        success: true,
        data: { retryCount }
      };
    } catch (error: any) {
      console.error('QueueManagerService: Failed to retry failed items:', error);
      return {
        success: false,
        error: error.message || 'Failed to retry failed items'
      };
    }
  }

  /**
   * Cleanup completed items older than retention period
   */
  async cleanupCompletedItems(): Promise<QueueOperationResult> {
    try {
      const deletedCount = await this.queueAdapter.cleanupCompletedItems(this.config.completedItemRetentionDays);
      console.log(`QueueManagerService: Cleaned up ${deletedCount} completed items`);

      return {
        success: true,
        data: { deletedCount }
      };
    } catch (error: any) {
      console.error('QueueManagerService: Failed to cleanup completed items:', error);
      return {
        success: false,
        error: error.message || 'Failed to cleanup completed items'
      };
    }
  }

  /**
   * Remove a specific item from the queue
   */
  async removeQueueItem(itemId: string): Promise<QueueOperationResult> {
    try {
      await this.queueAdapter.removeItem(itemId);
      console.log(`QueueManagerService: Removed item ${itemId} from queue`);

      return { success: true };
    } catch (error: any) {
      console.error(`QueueManagerService: Failed to remove item ${itemId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to remove item from queue'
      };
    }
  }

  /**
   * Check if the queue system is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return await this.queueAdapter.isAvailable();
    } catch (error) {
      console.error('QueueManagerService: Availability check failed:', error);
      return false;
    }
  }

  /**
   * Get current network status
   */
  isOnline(): boolean {
    return this.networkStatus;
  }

  /**
   * Update queue configuration
   */
  updateConfig(newConfig: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('QueueManagerService: Updated configuration:', this.config);

    // Reschedule cleanup if interval changed
    if (newConfig.cleanupIntervalHours) {
      this.schedulePeriodicCleanup();
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources when service is destroyed
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.queueAdapter.close();
    QueueManagerService.instance = null;
    console.log('QueueManagerService: Service destroyed');
  }
}

// Export singleton instance
export const queueManager = QueueManagerService.getInstance();