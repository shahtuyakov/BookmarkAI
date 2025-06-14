import { IdempotencyService } from '../services/idempotency.service';
import { MetricsService } from '../services/metrics.service';
import { ConfigService } from '../../../config/services/config.service';

// Mock ioredis
jest.mock('ioredis', () => {
  class RedisMock {
    private store = new Map<string, { value: string; expiry?: number }>();

    get(key: string) {
      const item = this.store.get(key);
      if (!item) return Promise.resolve(null);
      if (item.expiry && Date.now() > item.expiry) {
        this.store.delete(key);
        return Promise.resolve(null);
      }
      return Promise.resolve(item.value);
    }

    set(key: string, value: string, flag?: string, ttl?: number) {
      const expiry = flag === 'EX' && ttl ? Date.now() + ttl * 1000 : undefined;
      this.store.set(key, { value, expiry });
      return Promise.resolve('OK');
    }

    setex(key: string, ttl: number, value: string) {
      const expiry = Date.now() + ttl * 1000;
      this.store.set(key, { value, expiry });
      return Promise.resolve('OK');
    }

    eval(lua: string, _numKeys: number, key: string, ...args: any[]) {
      const existing = this.store.get(key);
      if (existing && (!existing.expiry || Date.now() < existing.expiry)) {
        const data = JSON.parse(existing.value);
        // Check for stale lock recovery
        if (data.status === 'processing' && data.processingStartedAt) {
          const maxProcessingTime = parseInt(args[1]);
          const now = parseInt(args[2]);
          if (now - data.processingStartedAt > maxProcessingTime) {
            this.store.delete(key);
          } else {
            return Promise.resolve(existing.value);
          }
        } else {
          return Promise.resolve(existing.value);
        }
      }

      // Store new placeholder
      const placeholder = JSON.stringify({
        status: 'processing',
        processingStartedAt: parseInt(args[2]),
      });
      this.set(key, placeholder, 'EX', parseInt(args[0]));
      return Promise.resolve(null);
    }

    // Add method to simulate failures
    simulateFailure = false;

    async mockFailure() {
      if (this.simulateFailure) {
        throw new Error('Redis connection failed');
      }
    }
  }

  return {
    default: RedisMock,
    __esModule: true,
    Redis: RedisMock,
  };
});

// Mock database service with Drizzle query builder pattern
const mockDatabaseService = {
  database: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoNothing: jest.fn().mockResolvedValue([]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue([]),
    }),
  },
};

const USER_ID = 'user-123';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

function buildService(flagEnabled = true): {
  service: IdempotencyService;
  metrics: MetricsService;
} {
  process.env.ENABLE_IDEMPOTENCY_IOS_MVP = flagEnabled ? 'true' : 'false';
  process.env.NODE_ENV = 'test';

  const config = new ConfigService();
  const metrics = new MetricsService();
  const service = new IdempotencyService(config, metrics, mockDatabaseService as any);

  return { service, metrics };
}

describe('Enhanced IdempotencyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset database mocks
    mockDatabaseService.database.select.mockResolvedValue([]);
    mockDatabaseService.database.insert.mockResolvedValue([]);
    mockDatabaseService.database.update.mockResolvedValue([]);
    mockDatabaseService.database.delete.mockResolvedValue([]);
  });

  describe('Stale Lock Recovery', () => {
    it('should reclaim stale processing locks after timeout', async () => {
      const { service } = buildService(true);

      // First call should return null (new request)
      const first = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
      expect(first).toBeNull();

      // Simulate time passing beyond max processing time
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 35000); // 35 seconds later

      // Second call should reclaim stale lock
      const second = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
      expect(second).toBeNull();
    });
  });

  describe('Database Fallback', () => {
    it('should fall back to database when Redis fails', async () => {
      const { service } = buildService(true);

      // Mock Redis failure by making eval throw
      const redisInstance = (service as any).redis;
      redisInstance.simulateFailure = true;
      jest.spyOn(redisInstance, 'eval').mockRejectedValue(new Error('Redis failed'));

      // Mock database returning existing record
      mockDatabaseService.database.select.mockReturnValueOnce({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([
              {
                key: `test:idempotency:${USER_ID}:${IDEMPOTENCY_KEY}`,
                status: 'completed',
                responseBody: JSON.stringify({ test: 'response' }),
                expiresAt: new Date(Date.now() + 86400000),
                createdAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const result = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
      expect(result).toBe(JSON.stringify({ test: 'response' }));
      expect(mockDatabaseService.database.select).toHaveBeenCalled();
    });

    it('should store responses in both Redis and database', async () => {
      const { service } = buildService(true);
      const response = { success: true, data: { id: 'test' } };

      await service.storeResponse(USER_ID, IDEMPOTENCY_KEY, response, 201);

      // Should try to update database
      expect(mockDatabaseService.database.update).toHaveBeenCalled();
    });
  });

  describe('Request Fingerprinting', () => {
    it('should detect duplicates by content fingerprint', async () => {
      const { service } = buildService(true);
      const requestBody = { url: 'https://example.com/test' };

      // First request should return null
      const first = await service.checkIdempotentRequest(
        USER_ID,
        IDEMPOTENCY_KEY, // No explicit key
        requestBody,
        '/v1/shares',
      );
      expect(first).toBeNull();

      // Store fingerprint response
      await service.storeFingerprintResponse(USER_ID, requestBody, '/v1/shares', {
        success: true,
        data: { id: 'fingerprint-test' },
      });

      // Second request with same content should return cached response
      const second = await service.checkIdempotentRequest(
        USER_ID,
        IDEMPOTENCY_KEY,
        requestBody,
        '/v1/shares',
      );
      expect(second).toBeTruthy();
    });

    it('should generate different fingerprints for different content', async () => {
      const { service } = buildService(true);

      const generateFingerprint = (service as any).generateFingerprint.bind(service);

      const fp1 = generateFingerprint(USER_ID, '/v1/shares', { url: 'https://example.com/1' });
      const fp2 = generateFingerprint(USER_ID, '/v1/shares', { url: 'https://example.com/2' });

      expect(fp1).not.toBe(fp2);
    });

    it('should generate same fingerprints for same content in time window', async () => {
      const { service } = buildService(true);

      const generateFingerprint = (service as any).generateFingerprint.bind(service);
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const fp1 = generateFingerprint(USER_ID, '/v1/shares', { url: 'https://example.com/same' });

      // Same timestamp should produce same fingerprint
      const fp2 = generateFingerprint(USER_ID, '/v1/shares', { url: 'https://example.com/same' });

      expect(fp1).toBe(fp2);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track duplicate prevention metrics', async () => {
      const { service, metrics } = buildService(true);

      // First request
      await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);

      // Store response
      await service.storeResponse(USER_ID, IDEMPOTENCY_KEY, { test: 'data' });

      // Second request should track duplicate
      await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);

      const duplicateCount = metrics.getCounter('idempotency_duplicates_prevented_total', {
        reason: 'redis_cache',
      });
      expect(duplicateCount).toBe(1);
    });

    it('should track response times', async () => {
      const { service, metrics } = buildService(true);

      await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);

      const p95 = metrics.getHistogramPercentile('idempotency_check_duration_ms', 95);
      expect(p95).toBeGreaterThanOrEqual(0);
    });

    it('should track error rates', async () => {
      const { service, metrics } = buildService(true);

      // Simulate Redis failure
      const redisInstance = (service as any).redis;
      jest.spyOn(redisInstance, 'eval').mockRejectedValue(new Error('Redis failed'));

      await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);

      const errorCount = metrics.getCounter('idempotency_errors_total', {
        type: 'redis_failure',
      });
      expect(errorCount).toBe(1);
    });
  });

  describe('Response Parsing', () => {
    it('should parse structured responses correctly', async () => {
      const { service } = buildService(true);

      const structuredResponse = JSON.stringify({
        status: 'completed',
        statusCode: 201,
        body: { success: true, data: { id: 'test' } },
        completedAt: Date.now(),
      });

      const parsed = service.parseStoredResponse(structuredResponse);
      expect(parsed.isProcessing).toBe(false);
      expect(parsed.statusCode).toBe(201);
      expect(parsed.response).toEqual({ success: true, data: { id: 'test' } });
    });

    it('should handle processing status correctly', async () => {
      const { service } = buildService(true);

      const processingResponse = JSON.stringify({
        status: 'processing',
        processingStartedAt: Date.now(),
      });

      const parsed = service.parseStoredResponse(processingResponse);
      expect(parsed.isProcessing).toBe(true);
    });

    it('should handle legacy string responses', async () => {
      const { service } = buildService(true);

      const legacyResponse = '{"success": true, "data": {"id": "legacy"}}';

      const parsed = service.parseStoredResponse(legacyResponse);
      expect(parsed.isProcessing).toBe(false);
      expect(parsed.response).toEqual({ success: true, data: { id: 'legacy' } });
    });
  });

  describe('Body Canonicalization', () => {
    it('should produce consistent fingerprints regardless of key order', async () => {
      const { service } = buildService(true);

      const canonicalize = (service as any).canonicalizeBody.bind(service);

      const body1 = { url: 'https://example.com', title: 'Test' };
      const body2 = { title: 'Test', url: 'https://example.com' };

      expect(canonicalize(body1)).toBe(canonicalize(body2));
    });

    it('should handle non-object bodies', async () => {
      const { service } = buildService(true);

      const canonicalize = (service as any).canonicalizeBody.bind(service);

      expect(canonicalize('string')).toBe('string');
      expect(canonicalize(123)).toBe('123');
      expect(canonicalize(null)).toBe('');
      expect(canonicalize(undefined)).toBe('');
    });
  });
});
