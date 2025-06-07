import { FetchAdapter } from '../../src/adapters/fetch.adapter';

// Mock fetch globally
global.fetch = jest.fn();

describe('FetchAdapter', () => {
  let adapter: FetchAdapter;

  beforeEach(() => {
    adapter = new FetchAdapter();
    jest.clearAllMocks();
  });

  it('should make a successful GET request', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Map([['content-type', 'application/json']]),
      json: jest.fn().mockResolvedValue({ data: 'test' }),
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ...mockResponse,
      headers: {
        forEach: (callback: Function) => {
          mockResponse.headers.forEach((value, key) => callback(value, key));
        },
      },
    });

    const response = await adapter.request({
      url: 'https://api.example.com/test',
      method: 'GET',
    });

    expect(response.status).toBe(200);
    expect(response.data).toEqual({ data: 'test' });
    expect(response.headers['content-type']).toBe('application/json');
  });

  it('should handle request timeout', async () => {
    (global.fetch as jest.Mock).mockImplementation(() => 
      new Promise((_, reject) => {
        const error = new Error('AbortError');
        (error as any).name = 'AbortError';
        setTimeout(() => reject(error), 100);
      })
    );

    await expect(
      adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
        timeout: 50,
      })
    ).rejects.toThrow('Request timeout after 50ms');
  });

  it('should send POST request with data', async () => {
    const mockResponse = {
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: new Map(),
      json: jest.fn().mockResolvedValue({ id: '123' }),
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ...mockResponse,
      headers: {
        forEach: jest.fn(),
      },
    });

    const response = await adapter.request({
      url: 'https://api.example.com/shares',
      method: 'POST',
      data: { url: 'https://example.com' },
      headers: { 'Idempotency-Key': 'test-key' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/shares',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'test-key',
        }),
      })
    );

    expect(response.status).toBe(201);
  });
});