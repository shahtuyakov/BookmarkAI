import { Injectable, Logger } from '@nestjs/common';
import * as Redis from 'ioredis';
import { ConfigService } from '../../../config/services/config.service';

/**
 * Idempotency service for handling duplicate requests
 */
@Injectable()
export class IdempotencyService {
  private readonly redis: Redis.Redis;
  private readonly logger = new Logger(IdempotencyService.name);
  // Global prefix so different deploy environments sharing the same Redis cluster do not clash.
  private readonly envPrefix: string;
  private readonly keyPrefix = 'idempotency';
  private readonly ttlSeconds = 24 * 60 * 60; // 24 hours in seconds
  // Feature flag: enabled only when explicitly set in ENV.
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      (this.configService.get('ENABLE_IDEMPOTENCY_IOS_MVP', 'false') as string) === 'true';

    this.envPrefix = this.configService.get('NODE_ENV', 'dev') as string;

    this.redis = new Redis.Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }

  /**
   * Create a composite key by combining user ID and idempotency key
   */
  private createKey(userId: string, idempotencyKey: string): string {
    return `${this.envPrefix}:${this.keyPrefix}:${userId}:${idempotencyKey}`;
  }

  /**
   * Check if a request with this idempotency key has been seen before
   * @returns The stored response, or null if this is a new request
   */
  async checkIdempotentRequest(userId: string, idempotencyKey: string): Promise<string | null> {
    // Fast-exit when feature disabled or key missing
    if (!this.enabled || !idempotencyKey) {
      return null;
    }

    try {
      const key = this.createKey(userId, idempotencyKey);

      // Lua script: if value exists return it; otherwise set a processing placeholder atomically.
      const luaScript = `
        local k = KEYS[1]
        local ttl = tonumber(ARGV[1])
        local existing = redis.call('GET', k)
        if existing then
          return existing
        end
        -- Store minimal placeholder to indicate processing
        redis.call('SET', k, '{"status":"processing"}', 'EX', ttl)
        return nil
      `;

      const result = await this.redis.eval(luaScript, 1, key, this.ttlSeconds);

      // When result is boolean false or nil, treat as new request
      if (result && typeof result === 'string') {
        return result as string;
      }

      return null;
    } catch (error) {
      this.logger.error(`Error checking idempotent request: ${error.message}`, error.stack);
      return null; // Fail open - allow the request to proceed
    }
  }

  /**
   * Store the response for an idempotent request
   */
  async storeResponse(userId: string, idempotencyKey: string, response: string): Promise<void> {
    // Fast-exit when feature disabled or key missing
    if (!this.enabled || !idempotencyKey) {
      return;
    }

    try {
      const key = this.createKey(userId, idempotencyKey);
      await this.redis.set(key, response, 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.error(`Error storing idempotent response: ${error.message}`, error.stack);
      // Don't throw - this is a non-critical operation
    }
  }
}
