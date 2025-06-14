import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import * as Redis from 'ioredis';
import { eq } from 'drizzle-orm';
import { ConfigService } from '../../../config/services/config.service';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { idempotencyRecords } from '../../../db/schema/idempotency';
import { MetricsService } from './metrics.service';

/**
 * Idempotency service for handling duplicate requests
 * Enhanced with stale lock recovery, database fallback, and request fingerprinting
 */
@Injectable()
export class IdempotencyService {
  private readonly redis: Redis.Redis;
  private readonly logger = new Logger(IdempotencyService.name);
  // Global prefix so different deploy environments sharing the same Redis cluster do not clash.
  private readonly envPrefix: string;
  private readonly keyPrefix = 'idempotency';
  private readonly ttlSeconds = 24 * 60 * 60; // 24 hours in seconds
  private readonly maxProcessingTimeMs = 30 * 1000; // 30 seconds max processing time
  private readonly fingerprintWindowMs = 100; // 100ms coalesce window
  private readonly fingerprintTtlMs = 200; // 2x bucket window
  // Feature flag: enabled only when explicitly set in ENV.
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly databaseService: DrizzleService,
  ) {
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
  async checkIdempotentRequest(
    userId: string,
    idempotencyKey: string,
    requestBody?: any,
    requestPath?: string,
  ): Promise<string | null> {
    const startTime = Date.now();

    // Track total requests
    this.metricsService.incrementCounter('idempotency_requests_total', {
      platform: 'unknown', // Will be enhanced later with platform detection
    });

    // Fast-exit when feature disabled
    if (!this.enabled) {
      return null;
    }

    try {
      // Try explicit idempotency key first
      if (idempotencyKey) {
        const key = this.createKey(userId, idempotencyKey);

        // Try Redis first
        const redisResult = await this.checkRedis(key, startTime);
        if (redisResult !== null) {
          return redisResult;
        }

        // Fallback to database if Redis fails
        const dbResult = await this.checkDatabase(key, userId, idempotencyKey, startTime);
        if (dbResult !== null) {
          return dbResult;
        }
      }

      // Fallback to request fingerprinting
      if (requestBody && requestPath) {
        const fingerprintResult = await this.checkFingerprint(
          userId,
          requestBody,
          requestPath,
          startTime,
        );
        return fingerprintResult;
      }

      return null; // No idempotency check possible
    } catch (error) {
      this.logger.error(`Error checking idempotent request: ${error.message}`, error.stack);

      // Track error
      this.metricsService.incrementCounter('idempotency_errors_total', {
        type: 'check_request',
      });

      return null; // Fail open - allow the request to proceed
    }
  }

  /**
   * Check Redis for idempotency
   */
  private async checkRedis(key: string, startTime: number): Promise<string | null> {
    try {
      // Enhanced Lua script with stale lock recovery
      const luaScript = `
        local k = KEYS[1]
        local ttl = tonumber(ARGV[1])
        local maxProcessingTime = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        
        local existing = redis.call('GET', k)
        if existing then
          local data = cjson.decode(existing)
          -- Check for stale lock
          if data.status == 'processing' and data.processingStartedAt then
            if (now - data.processingStartedAt) > maxProcessingTime then
              -- Reclaim stale lock
              redis.call('DEL', k)
            else
              return existing
            end
          else
            return existing
          end
        end
        
        -- Store processing placeholder with timestamp
        local placeholder = cjson.encode({
          status = 'processing',
          processingStartedAt = now
        })
        redis.call('SET', k, placeholder, 'EX', ttl)
        return nil
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        key,
        this.ttlSeconds,
        this.maxProcessingTimeMs,
        Date.now(),
      );

      // When result is boolean false or nil, treat as new request
      if (result && typeof result === 'string') {
        // Track duplicate prevented
        this.metricsService.incrementCounter('idempotency_duplicates_prevented_total', {
          reason: 'redis_cache',
        });

        // Track response time
        this.metricsService.observeHistogram(
          'idempotency_check_duration_ms',
          Date.now() - startTime,
        );

        return result as string;
      }

      return null; // New request
    } catch (error) {
      this.logger.warn(`Redis check failed: ${error.message}`);

      // Track Redis error
      this.metricsService.incrementCounter('idempotency_errors_total', {
        type: 'redis_failure',
      });

      return null; // Signal to try database fallback
    }
  }

  /**
   * Check database for idempotency (fallback when Redis fails)
   */
  private async checkDatabase(
    key: string,
    userId: string,
    idempotencyKey: string,
    startTime: number,
  ): Promise<string | null> {
    try {
      // Check for existing record
      const existing = await this.databaseService.database
        .select()
        .from(idempotencyRecords)
        .where(eq(idempotencyRecords.key, key))
        .limit(1);

      if (existing.length > 0) {
        const record = existing[0];

        // Check if record is expired
        if (record.expiresAt && record.expiresAt < new Date()) {
          // Clean up expired record
          await this.databaseService.database
            .delete(idempotencyRecords)
            .where(eq(idempotencyRecords.key, key));

          return null; // Treat as new request
        }

        // Check for stale processing
        if (record.status === 'processing' && record.createdAt) {
          const processingTime = Date.now() - record.createdAt.getTime();
          if (processingTime > this.maxProcessingTimeMs) {
            // Reclaim stale lock
            await this.databaseService.database
              .delete(idempotencyRecords)
              .where(eq(idempotencyRecords.key, key));

            return null; // Treat as new request
          }
        }

        // Track duplicate prevented
        this.metricsService.incrementCounter('idempotency_duplicates_prevented_total', {
          reason: 'database_fallback',
        });

        // Track response time
        this.metricsService.observeHistogram(
          'idempotency_check_duration_ms',
          Date.now() - startTime,
        );

        return record.responseBody || JSON.stringify({ status: 'processing' });
      }

      // Create new processing record
      const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
      await this.databaseService.database
        .insert(idempotencyRecords)
        .values({
          key,
          userId,
          endpoint: '/v1/shares', // Could be parameterized
          status: 'processing',
          requestHash: key, // Simple hash for now
          expiresAt,
        })
        .onConflictDoNothing(); // Handle race conditions

      return null; // New request
    } catch (error) {
      this.logger.error(`Database fallback failed: ${error.message}`, error.stack);

      // Track database error
      this.metricsService.incrementCounter('idempotency_errors_total', {
        type: 'database_failure',
      });

      return null; // Fail open
    }
  }

  /**
   * Store the response for an idempotent request
   */
  async storeResponse(
    userId: string,
    idempotencyKey: string,
    response: any,
    statusCode: number = 200,
  ): Promise<void> {
    // Fast-exit when feature disabled or key missing
    if (!this.enabled || !idempotencyKey) {
      return;
    }

    try {
      const key = this.createKey(userId, idempotencyKey);

      // Store structured response with metadata
      const responseData = {
        status: 'completed',
        statusCode,
        body: response,
        completedAt: Date.now(),
        processingStartedAt: null, // Clear processing timestamp
      };

      const responseJson = JSON.stringify(responseData);

      // Store in Redis (primary)
      try {
        await this.redis.set(key, responseJson, 'EX', this.ttlSeconds);
      } catch (redisError) {
        this.logger.warn(`Failed to store in Redis: ${redisError.message}`);

        // Track Redis error
        this.metricsService.incrementCounter('idempotency_errors_total', {
          type: 'redis_store_failure',
        });
      }

      // Store in database (fallback and durability)
      try {
        await this.databaseService.database
          .update(idempotencyRecords)
          .set({
            status: 'completed',
            responseBody: responseJson,
            completedAt: new Date(),
          })
          .where(eq(idempotencyRecords.key, key));
      } catch (dbError) {
        this.logger.warn(`Failed to store in database: ${dbError.message}`);

        // Track database error
        this.metricsService.incrementCounter('idempotency_errors_total', {
          type: 'database_store_failure',
        });
      }

      this.logger.debug(`Stored idempotent response for key: ${key}`);
    } catch (error) {
      this.logger.error(`Error storing idempotent response: ${error.message}`, error.stack);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Parse stored idempotent response and extract the body
   */
  parseStoredResponse(storedData: string): {
    isProcessing: boolean;
    response?: any;
    statusCode?: number;
  } {
    try {
      const data = JSON.parse(storedData);

      if (data.status === 'processing') {
        return { isProcessing: true };
      }

      if (data.status === 'completed') {
        return {
          isProcessing: false,
          response: data.body,
          statusCode: data.statusCode || 200,
        };
      }

      // Legacy format - just return as-is
      return {
        isProcessing: false,
        response: data,
        statusCode: 200,
      };
    } catch (error) {
      this.logger.warn(`Failed to parse stored response: ${error.message}`);
      // Treat as legacy string response
      return {
        isProcessing: false,
        response: storedData,
        statusCode: 200,
      };
    }
  }

  /**
   * Check request fingerprint for content-based deduplication
   */
  private async checkFingerprint(
    userId: string,
    requestBody: any,
    requestPath: string,
    startTime: number,
  ): Promise<string | null> {
    try {
      const fingerprint = this.generateFingerprint(userId, requestPath, requestBody);
      const fingerprintKey = `${this.envPrefix}:fingerprint:${fingerprint}`;

      // Check Redis for fingerprint
      const existing = await this.redis.get(fingerprintKey);
      if (existing) {
        // Track duplicate prevented by fingerprinting
        this.metricsService.incrementCounter('idempotency_duplicates_prevented_total', {
          reason: 'fingerprint_match',
        });

        // Track response time
        this.metricsService.observeHistogram(
          'idempotency_check_duration_ms',
          Date.now() - startTime,
        );

        return existing;
      }

      // Store fingerprint with short TTL
      const placeholderData = JSON.stringify({
        status: 'processing',
        processingStartedAt: Date.now(),
        method: 'fingerprint',
      });

      await this.redis.setex(
        fingerprintKey,
        Math.ceil(this.fingerprintTtlMs / 1000),
        placeholderData,
      );

      return null; // New request
    } catch (error) {
      this.logger.warn(`Fingerprint check failed: ${error.message}`);
      return null; // Fail open
    }
  }

  /**
   * Generate deterministic fingerprint for request deduplication
   */
  private generateFingerprint(userId: string, method: string, body: any): string {
    const timestamp = Date.now();
    const timeBucket = Math.floor(timestamp / this.fingerprintWindowMs);

    const components = [userId, method, this.canonicalizeBody(body), timeBucket.toString()];

    return crypto.createHash('sha256').update(components.join('|')).digest('hex');
  }

  /**
   * Canonicalize request body for consistent fingerprinting
   */
  private canonicalizeBody(body: any): string {
    if (!body || typeof body !== 'object') {
      return String(body || '');
    }

    // Sort keys and stringify consistently
    const sortedKeys = Object.keys(body).sort();
    const canonicalData: Record<string, any> = {};

    for (const key of sortedKeys) {
      canonicalData[key] = body[key];
    }

    return JSON.stringify(canonicalData);
  }

  /**
   * Store fingerprint response
   */
  async storeFingerprintResponse(
    userId: string,
    requestBody: any,
    requestPath: string,
    response: any,
  ): Promise<void> {
    if (!this.enabled || !requestBody || !requestPath) {
      return;
    }

    try {
      const fingerprint = this.generateFingerprint(userId, requestPath, requestBody);
      const fingerprintKey = `${this.envPrefix}:fingerprint:${fingerprint}`;

      const responseData = JSON.stringify({
        status: 'completed',
        body: response,
        completedAt: Date.now(),
      });

      await this.redis.setex(fingerprintKey, Math.ceil(this.fingerprintTtlMs / 1000), responseData);
    } catch (error) {
      this.logger.warn(`Failed to store fingerprint response: ${error.message}`);
    }
  }
}
