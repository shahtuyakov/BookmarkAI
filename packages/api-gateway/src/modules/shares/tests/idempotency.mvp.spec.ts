import { IdempotencyService } from '../services/idempotency.service';
import { MetricsService } from '../services/metrics.service';
import { ConfigService } from '../../../config/services/config.service';

// Mock ioredis with an in-memory map implementation
jest.mock('ioredis', () => {
  class RedisMock {
    private store = new Map<string, string>();

    // get value or null
    get(key: string) {
      return Promise.resolve(this.store.get(key) ?? null);
    }

    // set value with optional EX flag
    set(key: string, value: string) {
      this.store.set(key, value);
      return Promise.resolve('OK');
    }

    // eval simple Lua script used in IdempotencyService
    eval(lua: string, _numKeys: number, key: string, _ttlSeconds: number) {
      const existing = this.store.get(key);
      if (existing) return Promise.resolve(existing);
      // Simulate placeholder storage
      this.store.set(key, '{"status":"processing"}');
      // Ignore TTL for mock
      return Promise.resolve(null);
    }
  }

  return {
    // Default export is the Redis constructor function in ioredis
    default: RedisMock,
    __esModule: true,
    // Named export Redis to match "import * as Redis from 'ioredis'" usage
    Redis: RedisMock,
  };
});

const USER_ID = 'user-123';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';

// Mock database service
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

function buildService(flagEnabled = true): IdempotencyService {
  // Set env vars before instantiating ConfigService
  process.env.ENABLE_IDEMPOTENCY_IOS_MVP = flagEnabled ? 'true' : 'false';
  process.env.NODE_ENV = 'test';

  const config = new ConfigService();
  const metrics = new MetricsService();
  return new IdempotencyService(config, metrics, mockDatabaseService as any);
}

describe('IdempotencyService (MVP)', () => {
  it('returns null on first request and placeholder stored', async () => {
    const service = buildService(true);

    const first = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
    expect(first).toBeNull();

    // Second call should hit placeholder
    const second = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
    expect(second).toBe('{"status":"processing"}');
  });

  it('stores and retrieves final response', async () => {
    const service = buildService(true);

    const responseBody = { success: true };
    await service.storeResponse(USER_ID, IDEMPOTENCY_KEY, responseBody);

    const cached = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
    expect(cached).toBeTruthy();

    // Parse the structured response
    const parsed = service.parseStoredResponse(cached!);
    expect(parsed.isProcessing).toBe(false);
    expect(parsed.response).toEqual(responseBody);
  });

  it('feature flag disabled bypasses all logic', async () => {
    const service = buildService(false);

    const result = await service.checkIdempotentRequest(USER_ID, IDEMPOTENCY_KEY);
    expect(result).toBeNull();
  });
});
