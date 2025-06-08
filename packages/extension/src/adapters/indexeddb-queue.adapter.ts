import { QueueItem, QueueStatus } from '../types/queue';
import { generateULID } from '../utils/ulid';

/**
 * IndexedDB-based queue storage adapter for browser extensions
 * Provides offline storage for bookmark queue items with CRUD operations
 * Maintains schema consistency with iOS SQLite and Android Room implementations
 */
export class IndexedDBQueueAdapter {
  private dbName: string = 'BookmarkAIQueue';
  private dbVersion: number = 1;
  private storeName: string = 'bookmark_queue';
  private db: IDBDatabase | null = null;

  constructor() {
    this.initializeDatabase();
  }

  /**
   * Initialize IndexedDB database with queue table schema
   */
  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to open database', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDBQueueAdapter: Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Delete existing store if it exists (for schema updates)
        if (db.objectStoreNames.contains(this.storeName)) {
          db.deleteObjectStore(this.storeName);
        }

        // Create bookmark_queue object store
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });

        // Create indexes for efficient querying
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('url', 'url', { unique: false });

        console.log('IndexedDBQueueAdapter: Database schema created');
      };
    });
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureDatabase(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initializeDatabase();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  /**
   * Add a new item to the queue
   */
  async addToQueue(url: string, title?: string, notes?: string): Promise<QueueItem> {
    const db = await this.ensureDatabase();
    const now = Date.now();

    const queueItem: QueueItem = {
      id: generateULID(),
      url,
      title: title || null,
      notes: notes || null,
      createdAt: now,
      status: 'pending' as QueueStatus,
      retryCount: 0,
      lastError: null,
      updatedAt: now,
      timestamp: now, // React Native compatibility
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.add(queueItem);

      request.onsuccess = () => {
        console.log('IndexedDBQueueAdapter: Added item to queue:', queueItem.id);
        resolve(queueItem);
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to add item to queue', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all pending items from the queue
   */
  async getPendingItems(): Promise<QueueItem[]> {
    const db = await this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        const items = request.result || [];
        // Sort by createdAt to maintain FIFO processing order
        items.sort((a, b) => a.createdAt - b.createdAt);
        resolve(items);
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to get pending items', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all items in the queue (for debugging/display purposes)
   */
  async getAllItems(): Promise<QueueItem[]> {
    const db = await this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result || [];
        // Sort by createdAt (newest first for display)
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to get all items', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Update the status of a queue item
   */
  async updateItemStatus(
    id: string, 
    status: QueueStatus, 
    lastError?: string
  ): Promise<void> {
    const db = await this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // First get the existing item
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (!item) {
          reject(new Error(`Queue item not found: ${id}`));
          return;
        }

        // Update the item
        item.status = status;
        item.updatedAt = Date.now();
        if (lastError !== undefined) {
          item.lastError = lastError;
        }

        // Increment retry count if moving to failed status
        if (status === 'failed') {
          item.retryCount = (item.retryCount || 0) + 1;
        }

        // Put the updated item back
        const putRequest = store.put(item);
        
        putRequest.onsuccess = () => {
          console.log(`IndexedDBQueueAdapter: Updated item ${id} status to ${status}`);
          resolve();
        };

        putRequest.onerror = () => {
          console.error('IndexedDBQueueAdapter: Failed to update item status', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to get item for update', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  /**
   * Remove a completed item from the queue
   */
  async removeItem(id: string): Promise<void> {
    const db = await this.ensureDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        console.log(`IndexedDBQueueAdapter: Removed item from queue: ${id}`);
        resolve();
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to remove item', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const items = await this.getAllItems();

    const stats = {
      total: items.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    items.forEach(item => {
      if (item.status && stats.hasOwnProperty(item.status)) {
        stats[item.status as keyof typeof stats]++;
      }
    });

    return stats;
  }

  /**
   * Cleanup completed items older than specified days
   */
  async cleanupCompletedItems(olderThanDays: number = 7): Promise<number> {
    const db = await this.ensureDatabase();
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('status');
      const request = index.getAll('completed');

      request.onsuccess = () => {
        const completedItems = request.result || [];
        const itemsToDelete = completedItems.filter(item => item.updatedAt < cutoffTime);

        if (itemsToDelete.length === 0) {
          resolve(0);
          return;
        }

        // Delete items in batch
        let processed = 0;
        itemsToDelete.forEach(item => {
          const deleteRequest = store.delete(item.id);
          deleteRequest.onsuccess = () => {
            deletedCount++;
            processed++;
            if (processed === itemsToDelete.length) {
              console.log(`IndexedDBQueueAdapter: Cleaned up ${deletedCount} completed items`);
              resolve(deletedCount);
            }
          };
          deleteRequest.onerror = () => {
            processed++;
            if (processed === itemsToDelete.length) {
              resolve(deletedCount);
            }
          };
        });
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to cleanup completed items', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Retry failed items (reset to pending status)
   */
  async retryFailedItems(): Promise<number> {
    const db = await this.ensureDatabase();
    let retryCount = 0;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('status');
      const request = index.getAll('failed');

      request.onsuccess = () => {
        const failedItems = request.result || [];

        if (failedItems.length === 0) {
          resolve(0);
          return;
        }

        let processed = 0;
        failedItems.forEach(item => {
          // Reset to pending status for retry
          item.status = 'pending';
          item.retryCount = 0;
          item.lastError = null;
          item.updatedAt = Date.now();

          const putRequest = store.put(item);
          putRequest.onsuccess = () => {
            retryCount++;
            processed++;
            if (processed === failedItems.length) {
              console.log(`IndexedDBQueueAdapter: Reset ${retryCount} failed items for retry`);
              resolve(retryCount);
            }
          };
          putRequest.onerror = () => {
            processed++;
            if (processed === failedItems.length) {
              resolve(retryCount);
            }
          };
        });
      };

      request.onerror = () => {
        console.error('IndexedDBQueueAdapter: Failed to retry failed items', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Check if database is available and accessible
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureDatabase();
      return true;
    } catch (error) {
      console.error('IndexedDBQueueAdapter: Database is not available', error);
      return false;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('IndexedDBQueueAdapter: Database connection closed');
    }
  }
}