import { BookmarkAIClient } from '../client';
import { ShareBatchProcessor } from '../utils/batch';

export interface CreateShareRequest {
  url: string;
  title?: string;
  notes?: string;
}

export interface Share {
  id: string;
  url: string;
  title?: string;
  notes?: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  platform: 'tiktok' | 'reddit' | 'twitter' | 'x' | 'unknown';
  userId: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
}

export interface ShareListResponse {
  items: Share[];
  cursor?: string;
  hasMore: boolean;
}

export interface CreateSharesBatchResponse {
  accepted: Share[];
  rejected: Array<{
    url: string;
    reason: string;
  }>;
}

export interface SharesServiceOptions {
  enableBatching?: boolean;
  batchWindow?: number;
  maxBatchSize?: number;
}

export class SharesService {
  private batchProcessor?: ShareBatchProcessor;

  constructor(
    private client: BookmarkAIClient,
    options: SharesServiceOptions = {}
  ) {
    if (options.enableBatching !== false) {
      this.initializeBatchProcessor();
    }
  }

  /**
   * Create a new share
   */
  async create(request: CreateShareRequest, idempotencyKey?: string): Promise<Share> {
    // Generate idempotency key if not provided
    const key = idempotencyKey || this.generateIdempotencyKey();

    // If batching is enabled and we're not explicitly bypassing it
    if (this.batchProcessor && !idempotencyKey) {
      return this.batchProcessor.add({
        ...request,
        idempotencyKey: key,
      }) as Promise<Share>;
    }

    // Direct API call
    const response = await this.client.request<Share>({
      url: '/shares',
      method: 'POST',
      headers: {
        'Idempotency-Key': key,
      },
      data: request,
    });

    return response.data;
  }

  /**
   * Create multiple shares in batch
   */
  async createBatch(shares: CreateShareRequest[]): Promise<CreateSharesBatchResponse> {
    const sharesWithKeys = shares.map(share => ({
      ...share,
      idempotencyKey: this.generateIdempotencyKey(),
    }));

    const response = await this.client.request<CreateSharesBatchResponse>({
      url: '/shares/batch',
      method: 'POST',
      data: { shares: sharesWithKeys },
    });

    return response.data;
  }

  /**
   * List user's shares
   */
  async list(params?: {
    cursor?: string;
    limit?: number;
    status?: Share['status'];
    platform?: Share['platform'];
  }): Promise<ShareListResponse> {
    const response = await this.client.request<ShareListResponse>({
      url: '/shares',
      method: 'GET',
      params,
    });

    return response.data;
  }

  /**
   * Get a specific share
   */
  async get(shareId: string): Promise<Share> {
    const response = await this.client.request<Share>({
      url: `/shares/${shareId}`,
      method: 'GET',
    });

    return response.data;
  }

  /**
   * List all shares (with pagination)
   */
  async *listAll(params?: {
    status?: Share['status'];
    platform?: Share['platform'];
  }): AsyncGenerator<Share, void, unknown> {
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.list({
        ...params,
        cursor,
        limit: 100, // Maximum page size
      });

      for (const share of response.items) {
        yield share;
      }

      cursor = response.cursor;
      hasMore = response.hasMore;
    }
  }

  /**
   * Wait for a share to be processed
   */
  async waitForProcessing(
    shareId: string, 
    options: {
      timeout?: number;
      pollInterval?: number;
    } = {}
  ): Promise<Share> {
    const { timeout = 30000, pollInterval = 1000 } = options;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const share = await this.get(shareId);
      
      if (share.status === 'done' || share.status === 'failed') {
        return share;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Timeout waiting for share ${shareId} to process`);
  }

  /**
   * Generate a unique idempotency key
   */
  private generateIdempotencyKey(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Initialize batch processor
   */
  private initializeBatchProcessor(): void {
    this.batchProcessor = new ShareBatchProcessor(
      async (shares) => {
        const response = await this.createBatch(
          shares.map(({ idempotencyKey, ...share }) => share)
        );

        // Map accepted shares back
        return response.accepted;
      }
    );
  }

  /**
   * Flush any pending batch operations
   */
  async flush(): Promise<void> {
    if (this.batchProcessor) {
      await this.batchProcessor.flush();
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.batchProcessor) {
      this.batchProcessor.clear();
    }
  }
}