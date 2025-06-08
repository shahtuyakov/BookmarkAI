import { NativeModules } from 'react-native';

const { ShareHandler } = NativeModules;

/**
 * React Native interface for iOS SQLite queue operations
 * Bridges between React Native SyncService and native SQLite storage
 */
export interface SQLiteQueueItem {
  id: string;
  url: string;
  title?: string;
  notes?: string;
  timestamp: number;  // For React Native compatibility (createdAt field)
  createdAt: number;  // Native SQLite field
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  lastError?: string;
  updatedAt: number;
}

export interface SQLiteQueueStats {
  pending?: number;
  processing?: number;
  completed?: number;
  failed?: number;
}

/**
 * iOS SQLite Queue Service
 * Provides React Native interface to native SQLite queue storage
 */
export class IOSSQLiteQueueService {
  private static instance: IOSSQLiteQueueService;

  static getInstance(): IOSSQLiteQueueService {
    if (!IOSSQLiteQueueService.instance) {
      IOSSQLiteQueueService.instance = new IOSSQLiteQueueService();
    }
    return IOSSQLiteQueueService.instance;
  }

  /**
   * Get all queue items from SQLite
   */
  async getAllQueueItems(): Promise<SQLiteQueueItem[]> {
    try {
      if (!ShareHandler?.getSQLiteQueueItems) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return [];
      }

      const items = await ShareHandler.getSQLiteQueueItems();
      console.log(`📋 IOSSQLiteQueueService: Retrieved ${items.length} total items`);
      return items;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to get all queue items:', error);
      return [];
    }
  }

  /**
   * Get pending queue items from SQLite
   */
  async getPendingQueueItems(): Promise<SQLiteQueueItem[]> {
    try {
      if (!ShareHandler?.getPendingQueueItems) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return [];
      }

      const items = await ShareHandler.getPendingQueueItems();
      console.log(`📋 IOSSQLiteQueueService: Retrieved ${items.length} pending items`);
      return items;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to get pending queue items:', error);
      return [];
    }
  }

  /**
   * Update queue item status
   */
  async updateQueueItemStatus(
    itemId: string, 
    status: SQLiteQueueItem['status'], 
    error?: string
  ): Promise<void> {
    try {
      if (!ShareHandler?.updateQueueItemStatus) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return;
      }

      await ShareHandler.updateQueueItemStatus(itemId, status, error || null);
      console.log(`✅ IOSSQLiteQueueService: Updated item ${itemId} to ${status}`);
    } catch (error) {
      console.error(`❌ IOSSQLiteQueueService: Failed to update item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Remove queue item
   */
  async removeQueueItem(itemId: string): Promise<void> {
    try {
      if (!ShareHandler?.removeQueueItem) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return;
      }

      await ShareHandler.removeQueueItem(itemId);
      console.log(`🗑️ IOSSQLiteQueueService: Removed item ${itemId}`);
    } catch (error) {
      console.error(`❌ IOSSQLiteQueueService: Failed to remove item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<SQLiteQueueStats> {
    try {
      if (!ShareHandler?.getQueueStats) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return {};
      }

      const stats = await ShareHandler.getQueueStats();
      console.log('📊 IOSSQLiteQueueService: Queue stats:', stats);
      return stats;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to get queue stats:', error);
      return {};
    }
  }

  /**
   * Clean up old completed items
   */
  async cleanupOldItems(olderThanHours: number = 24): Promise<number> {
    try {
      if (!ShareHandler?.cleanupOldItems) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return 0;
      }

      const deletedCount = await ShareHandler.cleanupOldItems(olderThanHours);
      console.log(`🧹 IOSSQLiteQueueService: Cleaned up ${deletedCount} old items`);
      return deletedCount;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to cleanup old items:', error);
      return 0;
    }
  }

  /**
   * Check if SQLite queue is available
   */
  isAvailable(): boolean {
    return !!(ShareHandler?.getSQLiteQueueItems && 
              ShareHandler?.updateQueueItemStatus && 
              ShareHandler?.removeQueueItem);
  }

  /**
   * Sync React Native MMKV queue to SQLite
   * Migration helper for existing queue items
   */
  async migrateMMKVToSQLite(mmkvItems: any[]): Promise<void> {
    console.log(`🔄 IOSSQLiteQueueService: Migrating ${mmkvItems.length} items from MMKV to SQLite`);
    
    // The native ShareHandler will handle adding items to SQLite
    // This is just for monitoring the migration process
    
    for (const item of mmkvItems) {
      try {
        console.log(`📦 IOSSQLiteQueueService: Migrating item ${item.id || 'unknown'}`);
        // Items are already migrated by the native ShareHandler
        // This could trigger additional sync logic if needed
      } catch (error) {
        console.error('❌ IOSSQLiteQueueService: Migration error for item:', item, error);
      }
    }
    
    console.log('✅ IOSSQLiteQueueService: Migration process completed');
  }

  /**
   * Clear all items from queue (for debugging)
   */
  async clearAllItems(): Promise<boolean> {
    try {
      if (!ShareHandler?.clearAllQueueItems) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return false;
      }

      const success = await ShareHandler.clearAllQueueItems();
      console.log(`🗑️ IOSSQLiteQueueService: Cleared all items: ${success}`);
      return success;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to clear all items:', error);
      return false;
    }
  }

  /**
   * Add test item to queue (for debugging)
   */
  async addTestItem(): Promise<boolean> {
    try {
      if (!ShareHandler?.addTestQueueItem) {
        console.warn('🚧 IOSSQLiteQueueService: SQLite methods not available');
        return false;
      }

      const success = await ShareHandler.addTestQueueItem();
      console.log(`🧪 IOSSQLiteQueueService: Added test item: ${success}`);
      return success;
    } catch (error) {
      console.error('❌ IOSSQLiteQueueService: Failed to add test item:', error);
      return false;
    }
  }

  /**
   * Sync SQLite queue with React Native SyncService
   * Updates queue item statuses based on processing results
   */
  async syncWithProcessingResults(results: {
    successful: string[];
    failed: Array<{ id: string; error: string }>;
  }): Promise<void> {
    console.log('🔄 IOSSQLiteQueueService: Syncing processing results with SQLite');

    // Mark successful items as completed
    for (const successfulId of results.successful) {
      try {
        await this.updateQueueItemStatus(successfulId, 'completed');
      } catch (error) {
        console.error(`❌ IOSSQLiteQueueService: Failed to mark ${successfulId} as completed:`, error);
      }
    }

    // Mark failed items with retry logic
    for (const failed of results.failed) {
      try {
        await this.updateQueueItemStatus(failed.id, 'failed', failed.error);
      } catch (error) {
        console.error(`❌ IOSSQLiteQueueService: Failed to mark ${failed.id} as failed:`, error);
      }
    }

    console.log('✅ IOSSQLiteQueueService: Sync completed');
  }
}