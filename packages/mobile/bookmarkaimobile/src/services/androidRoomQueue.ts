import { NativeModules } from 'react-native';

const { ShareHandler } = NativeModules;

export interface AndroidRoomQueueItem {
  id: string;
  url: string;
  title?: string;
  notes?: string;
  createdAt: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  lastError?: string;
  updatedAt: number;
}

export interface AndroidRoomQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
  recentlyCompleted?: number;
}

/**
 * Android Room Queue Service
 * Provides TypeScript interface to Android Room database for offline queue storage
 */
export class AndroidRoomQueueService {
  private static instance: AndroidRoomQueueService;

  private constructor() {}

  static getInstance(): AndroidRoomQueueService {
    if (!AndroidRoomQueueService.instance) {
      AndroidRoomQueueService.instance = new AndroidRoomQueueService();
    }
    return AndroidRoomQueueService.instance;
  }

  /**
   * Check if Android Room queue is available
   */
  isAvailable(): boolean {
    return ShareHandler != null && typeof ShareHandler.getPendingCount === 'function';
  }

  /**
   * Get all queue items
   */
  async getAllQueueItems(): Promise<AndroidRoomQueueItem[]> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const items = await ShareHandler.getAllQueueItems();
      return items;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get pending queue items
   */
  async getPendingQueueItems(): Promise<AndroidRoomQueueItem[]> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const items = await ShareHandler.getPendingQueueItems();
      return items;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Add item to queue
   */
  async addQueueItem(item: Omit<AndroidRoomQueueItem, 'id' | 'createdAt' | 'updatedAt' | 'retryCount'>): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const result = await ShareHandler.addQueueItem(
        item.url,
        item.title || null,
        item.notes || null,
        item.status
      );
      return result !== false;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update queue item status
   */
  async updateQueueItemStatus(
    itemId: string, 
    _status: AndroidRoomQueueItem['status'], 
    _error?: string
  ): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      await ShareHandler.markShareAsProcessed(itemId);
      return true;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Remove queue item
   */
  async removeQueueItem(itemId: string): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const result = await ShareHandler.removeQueueItem(itemId);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<AndroidRoomQueueStats> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const stats = await ShareHandler.getQueueStatus();
      return {
        pending: stats.pending || 0,
        processing: stats.uploading || stats.processing || 0,
        completed: stats.uploaded || stats.completed || 0,
        failed: stats.failed || 0,
        total: stats.total || 0,
        recentlyCompleted: stats.recentlyUploaded || stats.recentlyCompleted || 0
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get pending count
   */
  async getPendingCount(): Promise<number> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      return await ShareHandler.getPendingCount();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clear completed items
   */
  async cleanupOldItems(_olderThanHours: number = 24): Promise<number> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      return await ShareHandler.clearCompletedItems();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Retry failed items
   */
  async retryFailedItems(): Promise<number> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      return await ShareHandler.retryFailedItems();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Clear all items (for testing)
   */
  async clearAllItems(): Promise<boolean> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      const result = await ShareHandler.clearAllItems();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Sync processing results from React Native back to Android
   */
  async syncWithProcessingResults(results: {
    successful: string[];
    failed: Array<{ id: string; error: string }>;
  }): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      // Mark successful items as completed
      for (const successId of results.successful) {
        await this.updateQueueItemStatus(successId, 'completed');
      }

      // Mark failed items with error
      for (const failedItem of results.failed) {
        await this.updateQueueItemStatus(failedItem.id, 'failed', failedItem.error);
      }
    } catch (error) {
      console.error('AndroidRoomQueueService: Failed to sync processing results:', error);
      throw error;
    }
  }

  /**
   * Flush queue - trigger immediate processing
   */
  async flushQueue(): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      await ShareHandler.flushQueue();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Migrate MMKV items to Android Room (similar to iOS migration)
   */
  async migrateMMKVToRoom(mmkvItems: any[]): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Android Room queue not available');
    }

    try {
      for (const item of mmkvItems) {
        const roomItem = {
          url: item.url,
          title: item.title,
          notes: item.notes,
          status: 'pending' as const
        };
        
        await this.addQueueItem(roomItem);
      }
    } catch (error) {
      console.error('AndroidRoomQueueService: Failed to migrate MMKV to Room:', error);
      throw error;
    }
  }
}