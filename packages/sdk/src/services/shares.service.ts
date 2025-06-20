import { AxiosError } from 'axios';
import { BookmarkAIClient } from '../client';
import { ShareBatchProcessor } from '../utils/batch';

/**
 * API response wrapper used by the API gateway
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Helper function to unwrap API response data
 */
function unwrapApiResponse<T>(response: { data: ApiResponse<T> | T }): T {
  const responseData = response.data;

  // If it's wrapped in ApiResponse format, extract the data
  if (responseData && typeof responseData === 'object' && 'success' in responseData) {
    const apiResponse = responseData as ApiResponse<T>;
    if (!apiResponse.success || !apiResponse.data) {
      throw new Error(apiResponse.error?.message || 'API request failed');
    }
    return apiResponse.data;
  }

  // Otherwise return as-is (backwards compatibility)
  return responseData as T;
}

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
  metadata?: Record<string, unknown>;
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

// In-memory cache to reuse idempotency keys for the same URL within a short time window
const inMemoryKeyCache: Map<string, { key: string; ts: number }> = new Map();

// Reuse window (ms)
const KEY_REUSE_WINDOW_MS = 30_000;

function isTransientNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  // AxiosError codes for network issues across environments
  const TRANSIENT_CODES = ['ECONNABORTED', 'ENETUNREACH', 'ETIMEDOUT', 'ECONNRESET', 'ERR_NETWORK'];

  if ((error as AxiosError).isAxiosError) {
    const code = (error as AxiosError).code;
    return code ? TRANSIENT_CODES.includes(code) : false;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class SharesService {
  private batchProcessor?: ShareBatchProcessor;

  constructor(
    private client: BookmarkAIClient,
    options: SharesServiceOptions = {},
  ) {
    if (options.enableBatching !== false) {
      this.initializeBatchProcessor();
    }
  }

  /**
   * Create a new share
   */
  async create(request: CreateShareRequest, idempotencyKey?: string): Promise<Share> {
    // Generate or reuse idempotency key
    let key = idempotencyKey;

    if (!key) {
      const cached = inMemoryKeyCache.get(request.url);
      const now = Date.now();

      if (cached && now - cached.ts < KEY_REUSE_WINDOW_MS) {
        key = cached.key;
      } else {
        key = this.generateIdempotencyKey();
        inMemoryKeyCache.set(request.url, { key, ts: now });
      }
    }

    // If batching is enabled and we're not explicitly bypassing it
    if (this.batchProcessor && !idempotencyKey) {
      return this.batchProcessor.add({
        ...request,
        idempotencyKey: key,
      }) as Promise<Share>;
    }

    // Direct API call with transient-error retry (max 3 attempts)
    const MAX_ATTEMPTS = 3;
    let attempt = 0;

    while (attempt < MAX_ATTEMPTS) {
      try {
        const response = await this.client.request<ApiResponse<Share> | Share>({
          url: '/v1/shares',
          method: 'POST',
          headers: {
            'idempotency-key': key,
          },
          data: request,
        });

        return unwrapApiResponse<Share>(response);
      } catch (error) {
        if (isTransientNetworkError(error) && attempt < MAX_ATTEMPTS - 1) {
          const baseDelay = 100 * Math.pow(2, attempt); // 100ms, 200ms
          const jitter = Math.random() * 0.3 * baseDelay;
          await sleep(baseDelay + jitter);
          attempt += 1;
          continue;
        }
        throw error;
      }
    }

    // Should never reach here
    throw new Error('Failed to create share after retries');
  }

  /**
   * Create multiple shares in batch
   */
  async createBatch(shares: CreateShareRequest[]): Promise<CreateSharesBatchResponse> {
    const sharesWithKeys = shares.map(share => ({
      ...share,
      idempotencyKey: this.generateIdempotencyKey(),
    }));

    const response = await this.client.request<
      ApiResponse<CreateSharesBatchResponse> | CreateSharesBatchResponse
    >({
      url: '/v1/shares/batch',
      method: 'POST',
      data: { shares: sharesWithKeys },
    });

    return unwrapApiResponse<CreateSharesBatchResponse>(response);
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
    const response = await this.client.request<ApiResponse<ShareListResponse> | ShareListResponse>({
      url: '/v1/shares',
      method: 'GET',
      params,
    });

    return unwrapApiResponse<ShareListResponse>(response);
  }

  /**
   * Get a specific share
   */
  async get(shareId: string): Promise<Share> {
    const response = await this.client.request<ApiResponse<Share> | Share>({
      url: `/v1/shares/${shareId}`,
      method: 'GET',
    });

    return unwrapApiResponse<Share>(response);
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
    } = {},
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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Initialize batch processor
   */
  private initializeBatchProcessor(): void {
    this.batchProcessor = new ShareBatchProcessor(async shares => {
      const response = await this.createBatch(
        shares.map(({ idempotencyKey: _, ...share }) => share),
      );

      // Map accepted shares back
      return response.accepted;
    });
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
