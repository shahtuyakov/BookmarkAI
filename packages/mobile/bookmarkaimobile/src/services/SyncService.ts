import NetInfo from '@react-native-community/netinfo';
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { MMKV } from 'react-native-mmkv';
import { Platform } from 'react-native';
import { IOSSQLiteQueueService, SQLiteQueueItem } from './iOSSQLiteQueue';

interface QueuedShare {
  id: string;
  url: string;
  title?: string;
  notes?: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

export class SyncService {
  private static instance: SyncService;
  private storage = new MMKV({ id: 'sync-queue' });
  private iosSQLiteQueue?: IOSSQLiteQueueService;
  private isProcessing = false;
  private networkUnsubscribe?: () => void;
  private processingTimer?: NodeJS.Timeout;
  
  private readonly QUEUE_KEY = 'pending_shares';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  private constructor(private client: BookmarkAIClient) {
    this.setupNetworkListener();
    this.initializePlatformSpecificQueue();
  }

  /**
   * Initialize platform-specific queue services
   */
  private initializePlatformSpecificQueue(): void {
    if (Platform.OS === 'ios') {
      this.iosSQLiteQueue = IOSSQLiteQueueService.getInstance();
      
      if (this.iosSQLiteQueue.isAvailable()) {
        // Migrate existing MMKV items to SQLite if any exist
        this.migrateMmkvToSQLiteIfNeeded();
      } else {
      }
    }
  }

  static getInstance(client: BookmarkAIClient): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService(client);
    }
    return SyncService.instance;
  }

  /**
   * Add a share to the offline queue
   */
  async queueShare(share: Omit<QueuedShare, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    const queue = this.getQueue();
    
    const queuedShare: QueuedShare = {
      ...share,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0,
    };

    queue.push(queuedShare);
    this.saveQueue(queue);

    // Try to process immediately if online
    this.processQueue();
  }

  /**
   * Get all queued shares
   */
  getQueuedShares(): QueuedShare[] {
    return this.getQueue();
  }

  /**
   * Migrate existing MMKV queue items to SQLite (iOS only)
   */
  private async migrateMmkvToSQLiteIfNeeded(): Promise<void> {
    if (!this.iosSQLiteQueue) return;

    try {
      const mmkvQueue = this.getQueue();
      
      if (mmkvQueue.length > 0) {
        await this.iosSQLiteQueue.migrateMMKVToSQLite(mmkvQueue);
        
        // Clear MMKV queue after successful migration
        this.clearQueue();
      }
    } catch (error) {
      console.error('❌ SyncService: Failed to migrate MMKV to SQLite:', error);
    }
  }

  /**
   * Process all queued shares (with SQLite integration)
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return; // Already processing
    }

    // Check network status
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return;
    }

    // Check if authenticated
    const isAuthenticated = await this.client.isAuthenticated();
    if (!isAuthenticated) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get items from both SQLite (iOS) and MMKV
      const sqliteItems = await this.getSQLiteQueueItems();
      const mmkvItems = this.getQueue();
      

      // Process SQLite items (iOS)
      if (sqliteItems.length > 0) {
        await this.processSQLiteItems(sqliteItems);
      }

      // Process MMKV items (fallback/other platforms)
      if (mmkvItems.length > 0) {
        await this.processMmkvItems(mmkvItems);
      }

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process SQLite queue items (iOS specific)
   */
  private async processSQLiteItems(items: SQLiteQueueItem[]): Promise<void> {
    if (!this.iosSQLiteQueue) return;

    const successful: string[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const item of items) {
      try {
        // Mark as processing
        await this.iosSQLiteQueue.updateQueueItemStatus(item.id, 'processing');

        // Create share via SDK (API only accepts URL)
        await this.client.shares.create({
          url: item.url,
        });

        successful.push(item.id);

      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        failed.push({ id: item.id, error: errorMessage });
        console.error(`❌ SyncService: Failed to process SQLite item ${item.id}:`, errorMessage);
      }
    }

    // Update SQLite with results
    await this.iosSQLiteQueue.syncWithProcessingResults({ successful, failed });
    
  }

  /**
   * Process MMKV queue items (legacy/fallback)
   */
  private async processMmkvItems(items: QueuedShare[]): Promise<void> {
    const remainingQueue: QueuedShare[] = [];

    for (const share of items) {
      try {
        // Create share via SDK (API only accepts URL)
        await this.client.shares.create({
          url: share.url,
        });

        // Don't add to remaining queue - it's processed

      } catch (error: any) {
        console.error(`❌ SyncService: Failed to process MMKV share: ${share.url}`, error);
        
        share.retryCount++;
        share.lastError = error.message;

        // Add back to queue if under retry limit
        if (share.retryCount < this.MAX_RETRIES) {
          remainingQueue.push(share);
        } else {
          console.error(`❌ SyncService: MMKV share exceeded retry limit: ${share.url}`);
        }
      }
    }

    // Save remaining MMKV queue
    this.saveQueue(remainingQueue);

    // If there are still items, schedule another attempt
    if (remainingQueue.length > 0) {
      this.scheduleRetry();
    }

  }

  /**
   * Get SQLite queue items (iOS only)
   */
  private async getSQLiteQueueItems(): Promise<SQLiteQueueItem[]> {
    if (!this.iosSQLiteQueue || !this.iosSQLiteQueue.isAvailable()) {
      return [];
    }

    try {
      return await this.iosSQLiteQueue.getPendingQueueItems();
    } catch (error) {
      console.error('❌ SyncService: Failed to get SQLite queue items:', error);
      return [];
    }
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.saveQueue([]);
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = undefined;
    }
  }

  /**
   * Get queue statistics (including SQLite on iOS)
   */
  async getQueueStats(): Promise<{
    total: number;
    failed: number;
    pending: number;
    sqlite?: {
      pending?: number;
      processing?: number;
      completed?: number;
      failed?: number;
    };
    mmkv: {
      total: number;
      failed: number;
      pending: number;
    };
  }> {
    const mmkvQueue = this.getQueue();
    const mmkvFailed = mmkvQueue.filter(s => s.retryCount >= this.MAX_RETRIES).length;
    const mmkvPending = mmkvQueue.length - mmkvFailed;

    let sqliteStats;
    if (this.iosSQLiteQueue && this.iosSQLiteQueue.isAvailable()) {
      try {
        sqliteStats = await this.iosSQLiteQueue.getQueueStats();
      } catch (error) {
        console.error('❌ SyncService: Failed to get SQLite stats:', error);
      }
    }

    const sqlitePending = sqliteStats?.pending || 0;
    const totalPending = mmkvPending + sqlitePending;
    const totalFailed = mmkvFailed + (sqliteStats?.failed || 0);
    const totalProcessing = sqliteStats?.processing || 0;
    const totalCompleted = sqliteStats?.completed || 0;
    const total = mmkvQueue.length + sqlitePending + totalProcessing + totalCompleted + (sqliteStats?.failed || 0);

    return {
      total,
      failed: totalFailed,
      pending: totalPending,
      sqlite: sqliteStats,
      mmkv: {
        total: mmkvQueue.length,
        failed: mmkvFailed,
        pending: mmkvPending,
      },
    };
  }

  /**
   * Get all queued shares (including SQLite on iOS)
   */
  async getAllQueuedShares(): Promise<{
    sqlite: SQLiteQueueItem[];
    mmkv: QueuedShare[];
  }> {
    const mmkvItems = this.getQueue();
    let sqliteItems: SQLiteQueueItem[] = [];

    if (this.iosSQLiteQueue && this.iosSQLiteQueue.isAvailable()) {
      try {
        sqliteItems = await this.iosSQLiteQueue.getAllQueueItems();
      } catch (error) {
        console.error('❌ SyncService: Failed to get SQLite queue items:', error);
      }
    }

    return {
      sqlite: sqliteItems,
      mmkv: mmkvItems,
    };
  }

  /**
   * Clean up old completed items (SQLite only)
   */
  async cleanupOldItems(olderThanHours: number = 24): Promise<number> {
    if (!this.iosSQLiteQueue || !this.iosSQLiteQueue.isAvailable()) {
      return 0;
    }

    try {
      const deletedCount = await this.iosSQLiteQueue.cleanupOldItems(olderThanHours);
      return deletedCount;
    } catch (error) {
      console.error('❌ SyncService: Failed to cleanup old items:', error);
      return 0;
    }
  }

  /**
   * Setup network connectivity listener
   */
  private setupNetworkListener(): void {
    this.networkUnsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected) {
        // Delay to ensure network is stable
        setTimeout(() => this.processQueue(), 2000);
      }
    });
  }

  /**
   * Schedule a retry for failed shares
   */
  private scheduleRetry(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    this.processingTimer = setTimeout(() => {
      this.processQueue();
    }, this.RETRY_DELAY);
  }

  /**
   * Get queue from storage
   */
  private getQueue(): QueuedShare[] {
    try {
      const queueJson = this.storage.getString(this.QUEUE_KEY);
      if (!queueJson) {
        return [];
      }
      return JSON.parse(queueJson);
    } catch (error) {
      console.error('Failed to parse queue:', error);
      return [];
    }
  }

  /**
   * Save queue to storage
   */
  private saveQueue(queue: QueuedShare[]): void {
    try {
      this.storage.set(this.QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to save queue:', error);
    }
  }

  /**
   * Generate unique ID for queued share
   */
  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
    }
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
  }
}