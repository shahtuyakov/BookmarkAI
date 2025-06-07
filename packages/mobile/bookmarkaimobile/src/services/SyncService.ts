import NetInfo from '@react-native-community/netinfo';
import { BookmarkAIClient } from '@bookmarkai/sdk';
import { MMKV } from 'react-native-mmkv';

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
  private isProcessing = false;
  private networkUnsubscribe?: () => void;
  private processingTimer?: NodeJS.Timeout;
  
  private readonly QUEUE_KEY = 'pending_shares';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 5000; // 5 seconds

  private constructor(private client: BookmarkAIClient) {
    this.setupNetworkListener();
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
   * Process all queued shares
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
      const queue = this.getQueue();
      const remainingQueue: QueuedShare[] = [];

      for (const share of queue) {
        try {
          
          // Create share via SDK
          await this.client.shares.create({
            url: share.url,
            title: share.title,
            notes: share.notes,
          });

          // Don't add to remaining queue - it's processed
        } catch (error: any) {
          console.error(`Failed to process share: ${share.url}`, error);
          
          share.retryCount++;
          share.lastError = error.message;

          // Add back to queue if under retry limit
          if (share.retryCount < this.MAX_RETRIES) {
            remainingQueue.push(share);
          } else {
            console.error(`Share exceeded retry limit: ${share.url}`);
            // TODO: Could emit an event here for the UI to show failed shares
          }
        }
      }

      // Save remaining queue
      this.saveQueue(remainingQueue);

      // If there are still items, schedule another attempt
      if (remainingQueue.length > 0) {
        this.scheduleRetry();
      }
    } finally {
      this.isProcessing = false;
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
   * Get queue statistics
   */
  getQueueStats(): {
    total: number;
    failed: number;
    pending: number;
  } {
    const queue = this.getQueue();
    const failed = queue.filter(s => s.retryCount >= this.MAX_RETRIES).length;
    const pending = queue.length - failed;

    return {
      total: queue.length,
      failed,
      pending,
    };
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
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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