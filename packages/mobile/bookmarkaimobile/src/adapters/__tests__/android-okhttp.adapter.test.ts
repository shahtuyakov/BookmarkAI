import { Platform } from 'react-native';
import { AndroidOkHttpAdapter, createAndroidOkHttpAdapter } from '../android-okhttp.adapter';

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android'
  },
  NativeModules: {
    OkHttpNetworkAdapter: {
      request: jest.fn(),
      cancelRequest: jest.fn(),
      cancelAllRequests: jest.fn(),
      getAdapterInfo: jest.fn(),
      testAdapter: jest.fn(),
      PLATFORM: 'android',
      ADAPTER_NAME: 'OkHttp',
      SUPPORTS_CERTIFICATE_PINNING: true,
      SUPPORTS_PROGRESS_TRACKING: true,
      SUPPORTS_CANCELLATION: true,
      EVENTS: ['OkHttpUploadProgress', 'OkHttpDownloadProgress']
    }
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn()
  }))
}));

describe('AndroidOkHttpAdapter', () => {
  let adapter: AndroidOkHttpAdapter;
  const mockNativeModule = require('react-native').NativeModules.OkHttpNetworkAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AndroidOkHttpAdapter();
  });

  afterEach(() => {
    adapter.destroy();
  });

  describe('initialization', () => {
    it('should initialize on Android platform', () => {
      expect(AndroidOkHttpAdapter.isAvailable()).toBe(true);
    });

    it('should create adapter successfully', () => {
      const newAdapter = createAndroidOkHttpAdapter();
      expect(newAdapter).toBeInstanceOf(AndroidOkHttpAdapter);
      newAdapter?.destroy();
    });
  });

  describe('network requests', () => {
    it('should make GET request successfully', async () => {
      const mockResponse = {
        requestId: 'test_123',
        status: 200,
        statusText: 'OK',
        ok: true,
        data: JSON.stringify({ success: true }),
        headers: { 'content-type': 'application/json' },
        responseTime: 150,
        isRedirect: false,
        networkInfo: {}
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      const response = await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET'
      });

      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.data).toEqual({ success: true });
      expect(response.metadata?.adapter).toBe('OkHttp');
      expect(response.metadata?.platform).toBe('android');
    });

    it('should make POST request with body', async () => {
      const mockResponse = {
        requestId: 'test_456',
        status: 201,
        statusText: 'Created',
        ok: true,
        data: JSON.stringify({ id: 123 }),
        headers: {},
        responseTime: 200,
        isRedirect: false,
        networkInfo: {}
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      const requestBody = { name: 'test' };
      await adapter.request({
        url: 'https://api.example.com/create',
        method: 'POST',
        body: requestBody
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/create',
          method: 'POST',
          body: JSON.stringify(requestBody),
          priority: 'normal'
        })
      );
    });

    it('should handle priority mapping correctly', async () => {
      mockNativeModule.request.mockResolvedValue({
        requestId: 'test_789',
        status: 200,
        statusText: 'OK',
        ok: true,
        data: '{}',
        headers: {},
        responseTime: 100,
        isRedirect: false,
        networkInfo: {}
      });

      // Test high priority
      await adapter.request({
        url: 'https://api.example.com/urgent',
        priority: 'high'
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high'
        })
      );

      // Test low priority
      await adapter.request({
        url: 'https://api.example.com/background',
        priority: 'low'
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'low'
        })
      );
    });

    it('should handle request errors', async () => {
      const error = new Error('Network error');
      mockNativeModule.request.mockRejectedValue(error);

      await expect(adapter.request({
        url: 'https://api.example.com/error'
      })).rejects.toThrow('OkHttp request failed: Network error');
    });

    it('should handle non-JSON response data', async () => {
      const mockResponse = {
        requestId: 'test_text',
        status: 200,
        statusText: 'OK',
        ok: true,
        data: 'plain text response',
        headers: { 'content-type': 'text/plain' },
        responseTime: 50,
        isRedirect: false,
        networkInfo: {}
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      const response = await adapter.request({
        url: 'https://api.example.com/text'
      });

      expect(response.data).toBe('plain text response');
    });
  });

  describe('request cancellation', () => {
    it('should cancel specific request', async () => {
      mockNativeModule.cancelRequest.mockResolvedValue(true);

      const result = await adapter.cancelRequest('test_123');
      
      expect(result).toBe(true);
      expect(mockNativeModule.cancelRequest).toHaveBeenCalledWith('test_123');
    });

    it('should cancel all requests', async () => {
      mockNativeModule.cancelAllRequests.mockResolvedValue(5);

      const cancelledCount = await adapter.cancelAllRequests();
      
      expect(cancelledCount).toBe(5);
      expect(mockNativeModule.cancelAllRequests).toHaveBeenCalled();
    });

    it('should handle cancellation errors gracefully', async () => {
      mockNativeModule.cancelRequest.mockRejectedValue(new Error('Cancel failed'));

      const result = await adapter.cancelRequest('test_123');
      
      expect(result).toBe(false);
    });
  });

  describe('adapter info and testing', () => {
    it('should get adapter information', async () => {
      const mockInfo = {
        name: 'OkHttpNetworkAdapter',
        version: '1.0.0',
        supportsCertificatePinning: true,
        supportsProgressTracking: true,
        supportsCancellation: true,
        supportsConnectionPooling: true,
        activeRequests: 2,
        connectionPoolSize: 5
      };

      mockNativeModule.getAdapterInfo.mockResolvedValue(mockInfo);

      const info = await adapter.getInfo();
      
      expect(info).toEqual(mockInfo);
    });

    it('should test adapter functionality', async () => {
      const mockTestResult = {
        success: true,
        statusCode: 200,
        statusMessage: 'OK',
        isRedirect: false,
        responseTime: 120
      };

      mockNativeModule.testAdapter.mockResolvedValue(mockTestResult);

      const result = await adapter.test('https://httpbin.org/get');
      
      expect(result).toEqual(mockTestResult);
      expect(mockNativeModule.testAdapter).toHaveBeenCalledWith('https://httpbin.org/get');
    });
  });

  describe('platform compatibility', () => {
    it('should not be available on iOS', () => {
      // Mock iOS platform
      Object.defineProperty(Platform, 'OS', { value: 'ios' });
      
      expect(AndroidOkHttpAdapter.isAvailable()).toBe(false);
    });

    it('should throw error when not supported', async () => {
      // Mock unsupported platform
      Object.defineProperty(Platform, 'OS', { value: 'web' });
      
      const unsupportedAdapter = new AndroidOkHttpAdapter();
      
      await expect(unsupportedAdapter.request({
        url: 'https://api.example.com/test'
      })).rejects.toThrow('OkHttp adapter not available on this platform');
      
      unsupportedAdapter.destroy();
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on destroy', () => {
      const eventEmitter = require('react-native').NativeEventEmitter();
      
      adapter.destroy();
      
      expect(eventEmitter.removeAllListeners).toHaveBeenCalledWith('OkHttpUploadProgress');
      expect(eventEmitter.removeAllListeners).toHaveBeenCalledWith('OkHttpDownloadProgress');
    });
  });
});