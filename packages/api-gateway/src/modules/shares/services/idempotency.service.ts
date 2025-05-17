import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import * as Redis from 'ioredis';

/**
 * Idempotency service for handling duplicate requests
 */
@Injectable()
export class IdempotencyService {
  private readonly redis: Redis.Redis;
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly keyPrefix = 'idempotency';
  private readonly ttlSeconds = 24 * 60 * 60; // 24 hours in seconds

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis.Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }

  /**
   * Create a composite key by combining user ID and idempotency key
   */
  private createKey(userId: string, idempotencyKey: string): string {
    return `${this.keyPrefix}:${userId}:${idempotencyKey}`;
  }

  /**
   * Check if a request with this idempotency key has been seen before
   * @returns The stored response, or null if this is a new request
   */
  async checkIdempotentRequest(userId: string, idempotencyKey: string): Promise<string | null> {
    try {
      if (!idempotencyKey) {
        return null;
      }

      const key = this.createKey(userId, idempotencyKey);
      const storedResponse = await this.redis.get(key);
      
      return storedResponse;
    } catch (error) {
      this.logger.error(`Error checking idempotent request: ${error.message}`, error.stack);
      return null; // Fail open - allow the request to proceed
    }
  }

  /**
   * Store the response for an idempotent request
   */
  async storeResponse(userId: string, idempotencyKey: string, response: string): Promise<void> {
    try {
      if (!idempotencyKey) {
        return;
      }

      const key = this.createKey(userId, idempotencyKey);
      await this.redis.set(key, response, 'EX', this.ttlSeconds);
    } catch (error) {
      this.logger.error(`Error storing idempotent response: ${error.message}`, error.stack);
      // Don't throw - this is a non-critical operation
    }
  }
}