export interface BatchItem<T, R> {
  id: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: any) => void;
}

export interface BatchConfig {
  maxBatchSize: number;
  batchWindow: number; // milliseconds
  shouldBatch?: (items: any[]) => boolean;
}

/**
 * Batch multiple operations into a single request
 */
export class BatchProcessor<T, R> {
  private queue: BatchItem<T, R>[] = [];
  private timer?: NodeJS.Timeout;

  constructor(
    private config: BatchConfig,
    private processBatch: (items: T[]) => Promise<R[]>
  ) {}

  /**
   * Add an item to the batch queue
   */
  async add(data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      const item: BatchItem<T, R> = {
        id: Math.random().toString(36).substr(2, 9),
        data,
        resolve,
        reject,
      };

      this.queue.push(item);

      // Check if we should process immediately
      if (this.queue.length >= this.config.maxBatchSize) {
        this.flush();
      } else {
        // Schedule batch processing
        this.scheduleBatch();
      }
    });
  }

  /**
   * Process all queued items immediately
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    if (this.queue.length === 0) {
      return;
    }

    // Take all items from queue
    const batch = [...this.queue];
    this.queue = [];

    // Check if we should batch these items
    const items = batch.map(item => item.data);
    if (this.config.shouldBatch && !this.config.shouldBatch(items)) {
      // Process individually
      for (const item of batch) {
        try {
          const result = await this.processBatch([item.data]);
          item.resolve(result[0]);
        } catch (error) {
          item.reject(error);
        }
      }
      return;
    }

    // Process as batch
    try {
      const results = await this.processBatch(items);
      
      // Match results to items
      batch.forEach((item, index) => {
        if (index < results.length) {
          item.resolve(results[index]);
        } else {
          item.reject(new Error('Batch processing failed: missing result'));
        }
      });
    } catch (error) {
      // Reject all items in batch
      batch.forEach(item => item.reject(error));
    }
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatch(): void {
    if (this.timer) {
      return; // Already scheduled
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.config.batchWindow);
  }

  /**
   * Clear the queue and cancel scheduled processing
   */
  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    // Reject all pending items
    this.queue.forEach(item => 
      item.reject(new Error('Batch processor cleared'))
    );
    this.queue = [];
  }

  /**
   * Get the current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}

/**
 * Batch processor specifically for share operations
 */
export class ShareBatchProcessor extends BatchProcessor<
  { url: string; idempotencyKey: string; title?: string; notes?: string },
  { id: string; url: string; status: string }
> {
  constructor(
    processBatch: (shares: any[]) => Promise<any[]>
  ) {
    super(
      {
        maxBatchSize: 50,
        batchWindow: 2000, // 2 seconds
        shouldBatch: (items) => items.length > 1,
      },
      processBatch
    );
  }
}