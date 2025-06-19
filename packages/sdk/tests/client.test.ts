import { BookmarkAIClient } from '../src/client';
import { MemoryStorageAdapter } from '../src/adapters/storage/memory.storage';
import { NetworkAdapter, RequestConfig, Response } from '../src/adapters/types';

// Mock network adapter
class MockNetworkAdapter implements NetworkAdapter {
  mockResponses: Map<string, Response> = new Map();

  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    const key = `${config.method} ${config.url}`;
    const response = this.mockResponses.get(key);
    
    if (!response) {
      throw new Error(`No mock response for ${key}`);
    }

    return response as Response<T>;
  }

  setMockResponse(method: string, url: string, response: Response): void {
    this.mockResponses.set(`${method} ${url}`, response);
  }
}

describe('BookmarkAIClient', () => {
  let client: BookmarkAIClient;
  let mockAdapter: MockNetworkAdapter;
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    mockAdapter = new MockNetworkAdapter();
    storage = new MemoryStorageAdapter();
    
    client = new BookmarkAIClient({
      baseUrl: 'https://api.bookmarkai.com',
      adapter: mockAdapter,
      storage,
    });
  });

  afterEach(() => {
    client.destroy();
  });

  describe('Authentication', () => {
    it('should add auth header to requests', async () => {
      // Set tokens
      await client.setTokens({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });

      // Mock response
      mockAdapter.setMockResponse('GET', 'https://api.bookmarkai.com/shares', {
        data: { items: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Track the actual request
      let capturedConfig: RequestConfig | null = null;
      const originalRequest = mockAdapter.request.bind(mockAdapter);
      mockAdapter.request = async (config) => {
        capturedConfig = config;
        return originalRequest(config);
      };

      // Make request
      await client.request({
        url: '/shares',
        method: 'GET',
      });

      // Verify auth header was added
      expect(capturedConfig?.headers?.Authorization).toBe('Bearer test-access-token');
    });

    it('should refresh token on 401', async () => {
      // Set initial tokens
      await client.setTokens({
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
      });

      // Mock 401 response first, then success
      let requestCount = 0;
      mockAdapter.request = async (config) => {
        requestCount++;
        
        if (requestCount === 1) {
          // First request fails with 401
          return {
            data: { code: 'AUTH_EXPIRED', message: 'Token expired' },
            status: 401,
            statusText: 'Unauthorized',
            headers: {},
          };
        } else if (config.url.includes('/v1/auth/refresh')) {
          // Refresh request
          return {
            data: {
              accessToken: 'new-access-token',
              refreshToken: 'new-refresh-token',
            },
            status: 200,
            statusText: 'OK',
            headers: {},
          };
        } else {
          // Retry with new token
          return {
            data: { items: [] },
            status: 200,
            statusText: 'OK',
            headers: {},
          };
        }
      };

      // Make request
      const response = await client.request({
        url: '/shares',
        method: 'GET',
      });

      expect(response.status).toBe(200);
      expect(requestCount).toBe(3); // Initial + refresh + retry
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits in production', async () => {
      const prodClient = new BookmarkAIClient({
        baseUrl: 'https://api.bookmarkai.com',
        adapter: mockAdapter,
        storage,
        environment: 'production',
      });

      // Mock responses
      mockAdapter.setMockResponse('GET', 'https://api.bookmarkai.com/test', {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      // Make rapid requests
      const start = Date.now();
      const promises = [];
      
      for (let i = 0; i < 12; i++) {
        promises.push(prodClient.request({ url: '/test', method: 'GET' }));
      }

      await Promise.all(promises);
      const duration = Date.now() - start;

      // Should take at least 2 seconds due to rate limiting (10 requests per 10 seconds)
      expect(duration).toBeGreaterThan(2000);

      prodClient.destroy();
    });
  });

  describe('Error Handling', () => {
    it('should transform API errors', async () => {
      mockAdapter.setMockResponse('POST', 'https://api.bookmarkai.com/shares', {
        data: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid URL format',
          details: { field: 'url' },
        },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
      });

      await expect(
        client.request({
          url: '/shares',
          method: 'POST',
          data: { url: 'invalid' },
        })
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Invalid URL format',
        status: 400,
      });
    });

    it('should handle network errors', async () => {
      mockAdapter.request = async () => {
        throw new Error('Network timeout');
      };

      await expect(
        client.request({
          url: '/shares',
          method: 'GET',
        })
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'Network timeout',
        retryable: true,
      });
    });
  });

  describe('Configuration', () => {
    it('should update configuration dynamically', async () => {
      mockAdapter.setMockResponse('GET', 'https://api.bookmarkai.com/test', {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await client.request({ url: '/test', method: 'GET' });

      // Update base URL
      client.updateConfig({ baseUrl: 'https://staging-api.bookmarkai.com' });

      mockAdapter.setMockResponse('GET', 'https://staging-api.bookmarkai.com/test', {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await client.request({ url: '/test', method: 'GET' });
    });
  });
});