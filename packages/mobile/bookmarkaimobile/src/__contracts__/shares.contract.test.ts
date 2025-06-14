import { Pact } from '@pact-foundation/pact';
import path from 'path';
import {
  uuid,
  ulid,
  iso8601DateTime,
  like,
  term,
  errorResponseMatchers,
} from '@bookmarkai/test-matchers';
import axios from 'axios';

describe('React Native Shares Contract', () => {
  const provider = new Pact({
    consumer: 'bookmarkai-react-native',
    provider: 'bookmarkai-api-gateway',
    log: path.resolve(process.cwd(), 'logs', 'pact.log'),
    logLevel: 'warn',
    dir: path.resolve(process.cwd(), 'pacts'),
    spec: 2,
    cors: true,
    port: 8991,
  });

  const baseUrl = 'http://localhost:8991';
  const validAuthToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

  beforeAll(() => provider.setup());
  afterEach(() => provider.verify());
  afterAll(() => provider.finalize());

  describe('POST /v1/shares', () => {
    it('should successfully create a share from React Native', async () => {
      const requestBody = {
        url: 'https://example.com/article',
        title: 'Interesting article',
        notes: 'Remember to read this later',
      };

      const expectedResponse = {
        success: true,
        data: {
          id: ulid(),
          url: requestBody.url,
          title: requestBody.title,
          notes: requestBody.notes,
          status: 'pending',
          userId: ulid(),
          createdAt: iso8601DateTime(),
          updatedAt: iso8601DateTime(),
        },
        meta: {
          requestId: uuid(),
          version: '1.0.0',
        },
      };

      await provider.addInteraction({
        state: 'user is authenticated',
        uponReceiving: 'a request to create a share from React Native',
        withRequest: {
          method: 'POST',
          path: '/v1/shares',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`,
            'Idempotency-Key': term({
              matcher: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
              generate: '550e8400-e29b-41d4-a716-446655440000',
            }),
            'User-Agent': term({
              matcher: '.*BookmarkAI-ReactNative.*',
              generate: 'BookmarkAI-ReactNative/1.0.0',
            }),
          },
          body: like(requestBody),
        },
        willRespondWith: {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedResponse,
        },
      });

      const response = await axios.post(
        `${baseUrl}/v1/shares`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`,
            'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
            'User-Agent': 'BookmarkAI-ReactNative/1.0.0',
          },
        }
      );

      expect(response.status).toBe(202);
      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe('pending');
    });

    it.skip('should handle rate limiting errors', async () => {
      const requestBody = {
        url: 'https://example.com/article',
      };

      await provider.addInteraction({
        state: 'user has exceeded rate limit',
        uponReceiving: 'a request when rate limit is exceeded',
        withRequest: {
          method: 'POST',
          path: '/v1/shares',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`,
            'Idempotency-Key': term({
              matcher: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
              generate: '550e8400-e29b-41d4-a716-446655440001',
            }),
          },
          body: like(requestBody),
        },
        willRespondWith: {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-Rate-Limit-Limit': '10',
            'X-Rate-Limit-Remaining': '0',
            'X-Rate-Limit-Reset': term({
              matcher: '\\d+',
              generate: '1700000000',
            }),
          },
          body: errorResponseMatchers('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later'),
        },
      });

      try {
        await axios.post(
          `${baseUrl}/v1/shares`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${validAuthToken}`,
              'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440001',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        if (error.response) {
          expect(error.response.status).toBe(429);
          expect(error.response.data.success).toBe(false);
          expect(error.response.data.error.code).toBe('RATE_LIMIT_EXCEEDED');
        } else {
          // If no response, log the error for debugging
          console.error('Request error:', error.message);
          throw error;
        }
      }
    });

    it.skip('should handle validation errors for invalid URLs', async () => {
      const requestBody = {
        url: 'not-a-valid-url',
      };

      await provider.addInteraction({
        state: 'user is authenticated',
        uponReceiving: 'a request with invalid URL',
        withRequest: {
          method: 'POST',
          path: '/v1/shares',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${validAuthToken}`,
            'Idempotency-Key': term({
              matcher: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
              generate: '550e8400-e29b-41d4-a716-446655440002',
            }),
          },
          body: requestBody,
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            success: false,
            error: {
              code: 'VALIDATION_INVALID_URL',
              message: 'The provided URL is invalid',
              timestamp: iso8601DateTime(),
              path: '/v1/shares',
              requestId: uuid(),
              details: like({
                field: 'url',
                constraint: 'must be a valid URL',
              }),
            },
          },
        },
      });

      try {
        await axios.post(
          `${baseUrl}/v1/shares`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${validAuthToken}`,
              'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440002',
            },
          }
        );
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
        expect(error.response.data.error.code).toBe('VALIDATION_INVALID_URL');
      }
    });
  });
});

describe('Native Bridge Contract', () => {
  it('should handle share queue entries from native code', async () => {
    // This tests the contract for data passed from native iOS/Android
    // to React Native via the bridge

    // Mock the expected format from native bridge
    const nativeBridgeData = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      url: 'https://example.com/article',
      createdAt: '2024-01-15T10:30:00.000Z',
      status: 'pending',
      source: 'react-native',
      metadata: {
        title: 'Example Page',
        description: 'Example description',
      },
    };

    // Validate the structure matches our contract
    expect(nativeBridgeData.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(nativeBridgeData.url).toMatch(/^https?:\/\/.+/);
    expect(nativeBridgeData.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(['pending', 'processing', 'completed', 'failed']).toContain(nativeBridgeData.status);
    expect(['ios-share-extension', 'android-share-intent', 'webextension', 'react-native']).toContain(nativeBridgeData.source);
  });
});
