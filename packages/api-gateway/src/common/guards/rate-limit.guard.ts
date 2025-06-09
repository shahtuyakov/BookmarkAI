import { Injectable, CanActivate, ExecutionContext, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import {
  RateLimitConfig,
  RateLimitStore,
  RateLimitUtils,
  MemoryRateLimitStore,
} from '../interceptors/rate-limit.interceptor';
import { RateLimitException } from '../exceptions/api.exceptions';
import { ERROR_CODES } from '../constants/error-codes';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';

/**
 * Rate limiting guard that enforces ADR-012 compliant rate limiting
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject('RATE_LIMIT_STORE') private store: RateLimitStore = new MemoryRateLimitStore(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Check if rate limiting should be applied
    if (!RateLimitUtils.shouldRateLimit(request)) {
      return true;
    }

    // Get rate limit configuration from metadata
    const config = this.reflector.getAllAndOverride<RateLimitConfig>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Skip if rate limiting is disabled
    if (!config || config.disabled) {
      return true;
    }

    // Handle tiered rate limiting
    if (config.tiered) {
      return this.handleTieredRateLimit(request, config);
    }

    // Handle burst rate limiting
    if (config.burst) {
      return this.handleBurstRateLimit(request, config);
    }

    // Standard rate limiting
    return this.handleStandardRateLimit(request, config);
  }

  /**
   * Handle standard rate limiting
   */
  private async handleStandardRateLimit(
    request: FastifyRequest,
    config: RateLimitConfig,
  ): Promise<boolean> {
    const key = config.keyGenerator
      ? config.keyGenerator(request)
      : RateLimitUtils.generateKey(request);

    const result = await this.store.incr(key);

    // Store rate limit info on request for interceptor
    request.rateLimit = {
      limit: config.max,
      remaining: Math.max(0, config.max - result.current),
      reset: result.reset,
      window: Math.floor(config.windowMs / 1000),
      policy: RateLimitUtils.formatPolicy(config),
    };

    // Check if limit exceeded
    if (result.current > config.max) {
      const retryAfter = RateLimitUtils.calculateRetryAfter(result.reset);

      throw new RateLimitException(
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        config.message || 'Too many requests',
        retryAfter,
      );
    }

    return true;
  }

  /**
   * Handle tiered rate limiting based on user subscription
   */
  private async handleTieredRateLimit(
    request: FastifyRequest,
    config: RateLimitConfig,
  ): Promise<boolean> {
    const user = request.user;
    const userTier = user?.subscription?.tier || 'free';

    const tierConfig = config.tiers?.[userTier] || config.tiers?.['free'];

    if (!tierConfig) {
      throw new Error(`No rate limit configuration found for tier: ${userTier}`);
    }

    return this.handleStandardRateLimit(request, {
      ...tierConfig,
      message: `Rate limit exceeded for ${userTier} tier`,
      policy: `${userTier}-tier`,
    });
  }

  /**
   * Handle burst rate limiting (two-tier: burst + sustained)
   */
  private async handleBurstRateLimit(
    request: FastifyRequest,
    config: RateLimitConfig,
  ): Promise<boolean> {
    const baseKey = RateLimitUtils.generateKey(request);

    // Check burst limit first
    const burstKey = `burst:${baseKey}`;
    const burstResult = await this.store.incr(burstKey);

    if (burstResult.current > config.burst.max) {
      throw new RateLimitException(
        ERROR_CODES.RATE_LIMIT_BURST_EXCEEDED,
        'Burst rate limit exceeded',
        RateLimitUtils.calculateRetryAfter(burstResult.reset),
      );
    }

    // Check sustained limit
    const sustainedKey = `sustained:${baseKey}`;
    const sustainedResult = await this.store.incr(sustainedKey);

    if (sustainedResult.current > config.sustained.max) {
      throw new RateLimitException(
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        'Sustained rate limit exceeded',
        RateLimitUtils.calculateRetryAfter(sustainedResult.reset),
      );
    }

    // Store rate limit info (use the more restrictive limit)
    const burstRemaining = Math.max(0, config.burst.max - burstResult.current);
    const sustainedRemaining = Math.max(0, config.sustained.max - sustainedResult.current);

    request.rateLimit = {
      limit: Math.min(config.burst.max, config.sustained.max),
      remaining: Math.min(burstRemaining, sustainedRemaining),
      reset: Math.max(burstResult.reset, sustainedResult.reset),
      window: Math.min(
        Math.floor(config.burst.windowMs / 1000),
        Math.floor(config.sustained.windowMs / 1000),
      ),
      policy: 'burst-sustained',
    };

    return true;
  }
}

/**
 * Rate limiting module configuration
 */
export interface RateLimitModuleOptions {
  store?: RateLimitStore;
  globalConfig?: RateLimitConfig;
  skipIf?: (request: FastifyRequest) => boolean;
  keyGenerator?: (request: FastifyRequest) => string;
}

/**
 * Rate limiting statistics for monitoring
 */
export interface RateLimitStats {
  totalRequests: number;
  blockedRequests: number;
  topOffenders: Array<{
    key: string;
    requests: number;
    blocked: number;
  }>;
  resetTime: number;
}

/**
 * Rate limiting monitor for collecting metrics
 */
@Injectable()
export class RateLimitMonitor {
  private stats = new Map<
    string,
    {
      requests: number;
      blocked: number;
      lastReset: number;
    }
  >();

  /**
   * Record a rate limit check
   */
  recordRequest(key: string, blocked: boolean): void {
    const now = Date.now();
    const hourlyKey = `${key}:${Math.floor(now / (60 * 60 * 1000))}`;

    const stat = this.stats.get(hourlyKey) || {
      requests: 0,
      blocked: 0,
      lastReset: now,
    };

    stat.requests++;
    if (blocked) {
      stat.blocked++;
    }

    this.stats.set(hourlyKey, stat);
  }

  /**
   * Get rate limiting statistics
   */
  getStats(): RateLimitStats {
    const now = Date.now();
    const currentHour = Math.floor(now / (60 * 60 * 1000));

    let totalRequests = 0;
    let blockedRequests = 0;
    const offenders = new Map<string, { requests: number; blocked: number }>();

    for (const [key, stat] of this.stats.entries()) {
      const [baseKey, hour] = key.split(':');

      // Only include current hour
      if (parseInt(hour) === currentHour) {
        totalRequests += stat.requests;
        blockedRequests += stat.blocked;

        const existing = offenders.get(baseKey) || { requests: 0, blocked: 0 };
        existing.requests += stat.requests;
        existing.blocked += stat.blocked;
        offenders.set(baseKey, existing);
      }
    }

    // Sort top offenders by blocked requests
    const topOffenders = Array.from(offenders.entries())
      .map(([key, stats]) => ({ key, ...stats }))
      .sort((a, b) => b.blocked - a.blocked)
      .slice(0, 10);

    return {
      totalRequests,
      blockedRequests,
      topOffenders,
      resetTime: (currentHour + 1) * 60 * 60 * 1000,
    };
  }

  /**
   * Clear old statistics
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000; // Keep 24 hours

    for (const [key, stat] of this.stats.entries()) {
      if (stat.lastReset < cutoff) {
        this.stats.delete(key);
      }
    }
  }
}
