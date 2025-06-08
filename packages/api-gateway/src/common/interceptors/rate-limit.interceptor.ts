import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';

/**
 * Rate limiting interceptor that adds ADR-012 compliant headers
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    // Get rate limit info from request (set by rate limiting middleware)
    const rateLimitInfo = request.rateLimit;

    return next.handle().pipe(
      tap(() => {
        // Add rate limiting headers if available
        if (rateLimitInfo) {
          response.header('X-Rate-Limit-Limit', rateLimitInfo.limit.toString());
          response.header('X-Rate-Limit-Remaining', rateLimitInfo.remaining.toString());
          response.header('X-Rate-Limit-Reset', rateLimitInfo.reset.toString());

          // Add window information
          if (rateLimitInfo.window) {
            response.header('X-Rate-Limit-Window', rateLimitInfo.window.toString());
          }

          // Add policy information
          if (rateLimitInfo.policy) {
            response.header('X-Rate-Limit-Policy', rateLimitInfo.policy);
          }
        }
      }),
    );
  }
}

/**
 * Enhanced rate limit information interface
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp
  window: number; // Window size in seconds
  policy: string; // Rate limiting policy description
  retryAfter?: number; // Seconds to wait (for exceeded limits)
}

/**
 * Rate limit configuration for different endpoints
 */
export interface RateLimitConfig {
  windowMs: number; // Window size in milliseconds
  max: number; // Maximum requests per window
  message?: string; // Custom error message
  policy?: string; // Rate limiting policy description
  standardHeaders?: boolean; // Add standard headers
  legacyHeaders?: boolean; // Add legacy headers
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: FastifyRequest) => string;
  disabled?: boolean;
  tiered?: boolean;
  tiers?: Record<string, RateLimitConfig>;
  burst?: RateLimitConfig;
  sustained?: RateLimitConfig;
}

/**
 * Pre-configured rate limit policies
 */
export const RATE_LIMIT_POLICIES = {
  // Authentication endpoints - stricter limits
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per 15 minutes
    message: 'Too many authentication attempts, please try again later',
    policy: 'auth-strict',
  },

  // API endpoints - standard limits
  API: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many API requests, please slow down',
    policy: 'api-standard',
  },

  // Share creation - moderate limits
  SHARE_CREATE: {
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 shares per minute
    message: 'Too many share creation requests',
    policy: 'share-create',
  },

  // Batch operations - lower limits
  BATCH: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 batch operations per 5 minutes
    message: 'Too many batch operations',
    policy: 'batch-limited',
  },

  // File uploads - very limited
  UPLOAD: {
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 uploads per minute
    message: 'Too many upload requests',
    policy: 'upload-limited',
  },
} as const;

/**
 * Rate limit store interface for different backends
 */
export interface RateLimitStore {
  incr(key: string): Promise<{ current: number; reset: number }>;
  get(key: string): Promise<{ current: number; reset: number } | null>;
  reset(key: string): Promise<void>;
}

/**
 * Redis-based rate limit store implementation
 */
@Injectable()
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: Redis) {} // Redis client

  async incr(key: string): Promise<{ current: number; reset: number }> {
    const multi = this.redis.multi();
    const windowMs = 60 * 1000; // Default 1 minute window
    const reset = Math.floor(Date.now() / windowMs) * windowMs + windowMs;

    multi.incr(key);
    multi.expireat(key, Math.floor(reset / 1000));

    const results = await multi.exec();
    const current = results[0][1] as number;

    return { current, reset: Math.floor(reset / 1000) };
  }

  async get(key: string): Promise<{ current: number; reset: number } | null> {
    const current = await this.redis.get(key);
    if (current === null) return null;

    const ttl = await this.redis.ttl(key);
    const reset = ttl > 0 ? Math.floor(Date.now() / 1000) + ttl : 0;

    return { current: parseInt(current, 10), reset };
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/**
 * Memory-based rate limit store (for development/testing)
 */
@Injectable()
export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { current: number; reset: number }>();

  async incr(key: string): Promise<{ current: number; reset: number }> {
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute window
    const reset = Math.floor(now / windowMs) * windowMs + windowMs;

    const existing = this.store.get(key);

    if (!existing || existing.reset <= now) {
      const entry = { current: 1, reset: Math.floor(reset / 1000) };
      this.store.set(key, entry);
      return entry;
    }

    existing.current++;
    return existing;
  }

  async get(key: string): Promise<{ current: number; reset: number } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.reset * 1000 <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }
}

/**
 * Utility functions for rate limiting
 */
export class RateLimitUtils {
  /**
   * Generate rate limit key from request
   */
  static generateKey(request: FastifyRequest, prefix = 'rl'): string {
    const userId = request.user?.id;
    const ip = request.ip;
    const route = request.routerPath || request.url;

    // Use user ID if available, otherwise fall back to IP
    const identifier = userId || ip;

    return `${prefix}:${identifier}:${route}`;
  }

  /**
   * Check if request should be rate limited
   */
  static shouldRateLimit(request: FastifyRequest): boolean {
    // Skip rate limiting for health checks
    if (request.url === '/health' || request.url === '/api/health') {
      return false;
    }

    // Skip for internal requests (if applicable)
    const userAgent = request.headers['user-agent'];
    if (userAgent?.includes('internal-service')) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry after seconds
   */
  static calculateRetryAfter(reset: number): number {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, reset - now);
  }

  /**
   * Format rate limit policy description
   */
  static formatPolicy(config: RateLimitConfig): string {
    const windowSeconds = Math.floor(config.windowMs / 1000);
    const unit = windowSeconds >= 60 ? `${Math.floor(windowSeconds / 60)}min` : `${windowSeconds}s`;
    return `${config.max}/${unit}`;
  }
}
