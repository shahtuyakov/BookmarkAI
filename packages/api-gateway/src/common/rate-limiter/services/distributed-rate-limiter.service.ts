import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as CircuitBreaker from 'opossum';
import { Counter, Histogram } from 'prom-client';
import {
  RateLimitResult,
  RateLimitConfig,
  RateLimitOptions,
  RateLimiterService,
} from '../interfaces/rate-limiter.interface';
import {
  RateLimitError,
  RateLimiterUnavailableError,
} from '../errors/rate-limit.error';
import { RateLimitConfigService } from './rate-limit-config.service';

@Injectable()
export class DistributedRateLimiterService implements RateLimiterService, OnModuleInit {
  private readonly logger = new Logger(DistributedRateLimiterService.name);
  private readonly redis: Redis;
  private readonly circuitBreaker: CircuitBreaker;
  private configs: Map<string, RateLimitConfig> = new Map();
  
  // LUA scripts
  private slidingWindowScript: string;
  private tokenBucketScript: string;
  
  // Metrics
  private readonly metricsAllowed: Counter<string>;
  private readonly metricsRejected: Counter<string>;
  private readonly metricsRedisLatency: Histogram<string>;
  private readonly metricsRedisErrors: Counter<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimitConfigService: RateLimitConfigService,
  ) {
    // Initialize Redis client using existing cache configuration
    this.redis = new Redis({
      host: this.configService.get('CACHE_HOST', 'localhost'),
      port: this.configService.get('CACHE_PORT', 6379),
      password: this.configService.get('CACHE_PASSWORD', ''),
      db: this.configService.get('CACHE_RATE_LIMIT_DB', 2),
      keyPrefix: 'rl:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      commandTimeout: 100,
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(
      async (fn: Function) => fn(),
      {
        timeout: 100, // 100ms timeout
        errorThresholdPercentage: 50, // Open circuit at 50% error rate
        resetTimeout: 30000, // Try again after 30 seconds
        name: 'rate-limiter-redis',
      },
    );

    // Initialize metrics
    this.metricsAllowed = new Counter({
      name: 'rate_limiter_calls_allowed_total',
      help: 'Total number of rate limited calls that were allowed',
      labelNames: ['service', 'endpoint'],
    });

    this.metricsRejected = new Counter({
      name: 'rate_limiter_calls_rejected_total',
      help: 'Total number of rate limited calls that were rejected',
      labelNames: ['service', 'endpoint', 'reason'],
    });

    this.metricsRedisLatency = new Histogram({
      name: 'rate_limiter_redis_latency_seconds',
      help: 'Latency of Redis operations',
      labelNames: ['operation'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
    });

    this.metricsRedisErrors = new Counter({
      name: 'rate_limiter_redis_errors_total',
      help: 'Total number of Redis errors',
      labelNames: ['operation', 'error'],
    });

    // Circuit breaker event handlers
    this.circuitBreaker.on('open', () => {
      this.logger.error('Circuit breaker opened - Redis is unavailable');
    });

    this.circuitBreaker.on('halfOpen', () => {
      this.logger.warn('Circuit breaker half-open - testing Redis connection');
    });

    this.circuitBreaker.on('close', () => {
      this.logger.log('Circuit breaker closed - Redis is available');
    });
  }

  async onModuleInit() {
    // Load LUA scripts using absolute path from src directory
    const projectRoot = process.cwd();
    const scriptsDir = join(projectRoot, 'src', 'common', 'rate-limiter', 'scripts');
    
    this.slidingWindowScript = readFileSync(
      join(scriptsDir, 'sliding-window.lua'),
      'utf-8',
    );
    this.tokenBucketScript = readFileSync(
      join(scriptsDir, 'token-bucket.lua'),
      'utf-8',
    );

    // Load rate limit configurations
    await this.loadConfigurations();

    // Test Redis connection
    try {
      await this.redis.ping();
      this.logger.log('Connected to Redis for rate limiting');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
    }
  }

  async checkLimit(
    service: string,
    options: RateLimitOptions = {},
  ): Promise<RateLimitResult> {
    const config = this.rateLimitConfigService.getConfig(service);
    if (!config) {
      throw new Error(`No rate limit configuration found for service: ${service}`);
    }

    const identifier = options.identifier || 'default';
    const cost = options.cost || 1;

    try {
      const timer = this.metricsRedisLatency.startTimer({ operation: 'check_limit' });
      
      const result = await this.circuitBreaker.fire(async () => {
        if (config.algorithm === 'sliding_window') {
          return this.checkSlidingWindow(config, identifier);
        } else {
          return this.checkTokenBucket(config, identifier, cost, options.metadata);
        }
      }) as RateLimitResult;

      timer();

      if (result.allowed) {
        this.metricsAllowed.inc({ service, endpoint: identifier });
      } else {
        this.metricsRejected.inc({ service, endpoint: identifier, reason: 'limit_exceeded' });
      }

      return result;
    } catch (error) {
      if (error.name === 'TimeoutError' || error.name === 'CircuitBreakerOpenError') {
        this.metricsRedisErrors.inc({ operation: 'check_limit', error: error.name });
        this.metricsRejected.inc({ service, endpoint: identifier, reason: 'redis_unavailable' });
        
        // Fail closed - block the request
        throw new RateLimiterUnavailableError();
      }
      throw error;
    }
  }

  private async checkSlidingWindow(
    config: RateLimitConfig,
    identifier: string,
  ): Promise<RateLimitResult> {
    const rule = config.limits[0]; // Use first rule for now
    if (!rule.requests || !rule.window) {
      throw new Error('Invalid sliding window configuration');
    }

    const key = `sw:${config.service}:${identifier}`;
    const now = Date.now();
    const uniqueId = `${now}-${Math.random()}`;

    const result = await this.redis.eval(
      this.slidingWindowScript,
      1,
      key,
      now.toString(),
      rule.window.toString(),
      rule.requests.toString(),
      uniqueId,
    ) as [number, number, number, number];

    const [allowed, remaining, resetAt, retryAfter] = result;

    if (!allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${config.service}`,
        config.service,
        retryAfter,
        resetAt,
        remaining,
      );
    }

    return {
      allowed: allowed === 1,
      remaining,
      resetAt,
      retryAfter,
    };
  }

  private async checkTokenBucket(
    config: RateLimitConfig,
    identifier: string,
    cost: number,
    metadata?: Record<string, any>,
  ): Promise<RateLimitResult> {
    const rule = config.limits[0]; // Use first rule for now
    if (!rule.capacity || !rule.refillRate) {
      throw new Error('Invalid token bucket configuration');
    }

    const tokensKey = `tb:${config.service}:${identifier}:tokens`;
    const lastRefillKey = `tb:${config.service}:${identifier}:refill`;
    const now = Date.now();
    const ttl = config.ttl || 3600; // Default 1 hour TTL

    // Apply cost mapping if available
    if (config.costMapping && metadata?.operation) {
      cost = config.costMapping[metadata.operation] || cost;
    }

    const result = await this.redis.eval(
      this.tokenBucketScript,
      2,
      tokensKey,
      lastRefillKey,
      now.toString(),
      rule.capacity.toString(),
      rule.refillRate.toString(),
      cost.toString(),
      ttl.toString(),
    ) as [number, number, number, number];

    const [allowed, remaining, resetAt, retryAfter] = result;

    if (!allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${config.service}`,
        config.service,
        retryAfter,
        resetAt,
        remaining,
      );
    }

    return {
      allowed: allowed === 1,
      remaining,
      resetAt,
      retryAfter,
      cost,
    };
  }

  async recordUsage(service: string, cost: number = 1): Promise<void> {
    // This is already handled in checkLimit for atomic operations
    // This method exists for compatibility or manual recording if needed
    this.logger.debug(`Recorded usage for ${service}: ${cost}`);
  }

  async getBackoffDelay(service: string, identifier: string = 'default'): Promise<number> {
    const config = this.rateLimitConfigService.getConfig(service);
    if (!config) {
      return 1000; // Default 1 second
    }

    const backoffKey = `backoff:${service}:${identifier}`;
    const attempts = await this.redis.incr(backoffKey);
    await this.redis.expire(backoffKey, 300); // Reset after 5 minutes

    const { initialDelay, maxDelay, multiplier = 2, type } = config.backoff;
    let delay = initialDelay;

    if (type === 'exponential') {
      delay = Math.min(initialDelay * Math.pow(multiplier, attempts - 1), maxDelay);
    } else if (type === 'linear') {
      delay = Math.min(initialDelay * attempts, maxDelay);
    } else if (type === 'adaptive') {
      // Implement adaptive backoff based on success rate
      // For now, use exponential with lower multiplier
      delay = Math.min(initialDelay * Math.pow(1.5, attempts - 1), maxDelay);
    }

    // Add jitter to prevent thundering herd
    if (config.backoff.jitter !== false) {
      const jitter = delay * 0.1 * Math.random();
      delay = delay + jitter;
    }

    return Math.round(delay);
  }

  async reset(service: string, identifier: string = 'default'): Promise<void> {
    const config = this.rateLimitConfigService.getConfig(service);
    if (!config) {
      return;
    }

    const keys = [];
    if (config.algorithm === 'sliding_window') {
      keys.push(`sw:${service}:${identifier}`);
    } else {
      keys.push(`tb:${service}:${identifier}:tokens`);
      keys.push(`tb:${service}:${identifier}:refill`);
    }
    keys.push(`backoff:${service}:${identifier}`);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async loadConfigurations(): Promise<void> {
    // Load configurations from the config service
    this.configs = this.rateLimitConfigService.getAllConfigs();
    this.logger.log(`Loaded ${this.configs.size} rate limit configurations`);
  }
}