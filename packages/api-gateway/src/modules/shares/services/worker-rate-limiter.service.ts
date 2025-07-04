import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bull';
import { 
  DistributedRateLimiterService,
  RateLimitError,
  RateLimitResult,
} from '../../../common/rate-limiter';

export interface WorkerRateLimitOptions {
  platform: string;
  operation?: string;
  userId?: string;
  cost?: number;
}

@Injectable()
export class WorkerRateLimiterService {
  private readonly logger = new Logger(WorkerRateLimiterService.name);

  constructor(
    private readonly rateLimiter: DistributedRateLimiterService,
  ) {}

  /**
   * Check rate limit for a platform API call
   * Throws RateLimitError if limit exceeded
   */
  async checkPlatformLimit(options: WorkerRateLimitOptions): Promise<RateLimitResult> {
    const { platform, operation, userId, cost } = options;
    const identifier = userId || 'default';
    
    try {
      const result = await this.rateLimiter.checkLimit(platform, {
        identifier,
        cost,
        metadata: { operation },
      });

      this.logger.debug(
        `Rate limit check for ${platform}: allowed=${result.allowed}, remaining=${result.remaining}`,
      );

      return result;
    } catch (error) {
      if (error instanceof RateLimitError) {
        this.logger.warn(
          `Rate limit exceeded for ${platform}: retry after ${error.retryAfter}s`,
        );
        throw error;
      }
      
      // Re-throw other errors (e.g., RateLimiterUnavailableError)
      throw error;
    }
  }

  /**
   * Check rate limit for ML service calls
   */
  async checkMLServiceLimit(
    service: 'openai' | 'anthropic' | 'whisper' | 'embeddings',
    options: Omit<WorkerRateLimitOptions, 'platform'>,
  ): Promise<RateLimitResult> {
    return this.checkPlatformLimit({
      ...options,
      platform: service,
    });
  }

  /**
   * Calculate requeue delay for a job based on rate limit error
   */
  async getRequeueDelay(error: RateLimitError, job: Job): Promise<number> {
    // Use retry-after from error if available
    if (error.retryAfter && error.retryAfter > 0) {
      // Add some jitter to prevent thundering herd
      const jitter = Math.random() * 1000; // 0-1 second jitter
      return error.retryAfter * 1000 + jitter;
    }

    // Otherwise, use backoff strategy
    const attemptsMade = job.attemptsMade || 0;
    return this.rateLimiter.getBackoffDelay(error.service, job.data.userId);
  }

  /**
   * Check if an error is a rate limit error
   */
  isRateLimitError(error: any): error is RateLimitError {
    return error instanceof RateLimitError || 
           (error.name === 'RateLimitError' && error.retryAfter !== undefined);
  }

  /**
   * Extract rate limit info from HTTP response headers
   * Useful for updating our rate limit state based on API responses
   */
  parseRateLimitHeaders(headers: Record<string, any>, platform: string): {
    limit?: number;
    remaining?: number;
    reset?: number;
    retryAfter?: number;
  } {
    const result: any = {};

    // Standard rate limit headers
    if (headers['x-ratelimit-limit']) {
      result.limit = parseInt(headers['x-ratelimit-limit'], 10);
    }
    if (headers['x-ratelimit-remaining']) {
      result.remaining = parseInt(headers['x-ratelimit-remaining'], 10);
    }
    if (headers['x-ratelimit-reset']) {
      result.reset = parseInt(headers['x-ratelimit-reset'], 10) * 1000; // Convert to ms
    }
    if (headers['retry-after']) {
      result.retryAfter = parseInt(headers['retry-after'], 10);
    }

    // Platform-specific headers
    switch (platform) {
      case 'reddit':
        // Reddit uses x-ratelimit-* headers (standard)
        break;
      
      case 'twitter':
        // Twitter uses x-rate-limit-* headers
        if (headers['x-rate-limit-limit']) {
          result.limit = parseInt(headers['x-rate-limit-limit'], 10);
        }
        if (headers['x-rate-limit-remaining']) {
          result.remaining = parseInt(headers['x-rate-limit-remaining'], 10);
        }
        if (headers['x-rate-limit-reset']) {
          result.reset = parseInt(headers['x-rate-limit-reset'], 10) * 1000;
        }
        break;
        
      case 'openai':
        // OpenAI uses custom headers
        if (headers['x-ratelimit-limit-requests']) {
          result.limit = parseInt(headers['x-ratelimit-limit-requests'], 10);
        }
        if (headers['x-ratelimit-remaining-requests']) {
          result.remaining = parseInt(headers['x-ratelimit-remaining-requests'], 10);
        }
        break;
    }

    return result;
  }

  /**
   * Update rate limit state based on API response
   * This helps keep our limits in sync with actual API state
   */
  async updateFromResponse(
    platform: string,
    headers: Record<string, any>,
    userId?: string,
  ): Promise<void> {
    const rateLimitInfo = this.parseRateLimitHeaders(headers, platform);
    
    if (Object.keys(rateLimitInfo).length > 0) {
      this.logger.debug(
        `Updated rate limit info for ${platform} from response headers:`,
        rateLimitInfo,
      );
      
      // In a future enhancement, we could update our Redis state
      // based on these headers to stay in sync with the API
    }
  }
}