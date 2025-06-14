// import { Platform } from 'react-native';
import { IOSURLSessionAdapter } from '../ios-urlsession.adapter';

// Mock the native module
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  NativeModules: {
    URLSessionNetworkAdapter: {
      request: jest.fn(),
      cancelRequest: jest.fn(),
      cancelAllRequests: jest.fn(),
    },
  },
}));

describe('IOSURLSessionAdapter', () => {
  let adapter: IOSURLSessionAdapter;
  let mockNativeModule: any;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new IOSURLSessionAdapter();
    mockNativeModule = require('react-native').NativeModules.URLSessionNetworkAdapter;
  });

  describe('constructor', () => {
    it('should initialize on iOS platform', () => {
      expect(adapter).toBeInstanceOf(IOSURLSessionAdapter);
    });

    it('should warn if native module is not available', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      jest.doMock('react-native', () => ({
        Platform: { OS: 'ios' },
        NativeModules: {},
      }));

      new IOSURLSessionAdapter();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Native module not available')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('request', () => {
    it('should make a successful GET request', async () => {
      const mockResponse = {
        data: { id: 1, title: 'Test' },
        status: 200,
        headers: { 'content-type': 'application/json' },
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      const response = await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith({
        url: 'https://api.example.com/test',
        method: 'GET',
        headers: {},
        data: undefined,
        timeout: undefined,
      });

      expect(response).toEqual({
        data: mockResponse.data,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });
    });

    it('should make a POST request with data', async () => {
      const requestData = { name: 'Test', value: 123 };
      const mockResponse = {
        data: { id: 1, ...requestData },
        status: 201,
        headers: { 'content-type': 'application/json' },
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      const response = await adapter.request({
        url: 'https://api.example.com/test',
        method: 'POST',
        data: requestData,
        headers: {
          'Authorization': 'Bearer token123',
        },
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith({
        url: 'https://api.example.com/test',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token123',
        },
        data: requestData,
        timeout: undefined,
      });

      expect(response.status).toBe(201);
      expect(response.statusText).toBe('Created');
    });

    it('should handle query parameters', async () => {
      const mockResponse = {
        data: [],
        status: 200,
        headers: {},
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      await adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
        params: {
          page: 1,
          limit: 10,
          search: 'test query',
        },
      });

      expect(mockNativeModule.request).toHaveBeenCalledWith({
        url: 'https://api.example.com/test?page=1&limit=10&search=test+query',
        method: 'GET',
        headers: {},
        data: undefined,
        timeout: undefined,
      });
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'REQUEST_TIMEOUT';

      mockNativeModule.request.mockRejectedValue(timeoutError);

      await expect(adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
        timeout: 5000,
      })).rejects.toThrow('Request timeout');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('No internet');
      (networkError as any).code = 'NO_INTERNET';

      mockNativeModule.request.mockRejectedValue(networkError);

      await expect(adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      })).rejects.toThrow('No internet connection');
    });

    it('should handle non-2xx status codes', async () => {
      const mockResponse = {
        data: { error: 'Not found' },
        status: 404,
        headers: {},
      };

      mockNativeModule.request.mockResolvedValue(mockResponse);

      await expect(adapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      })).rejects.toThrow('Request failed with status 404');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel a specific request', async () => {
      await adapter.cancelRequest('request-123');

      expect(mockNativeModule.cancelRequest).toHaveBeenCalledWith('request-123');
    });

    it('should handle cancel errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockNativeModule.cancelRequest.mockRejectedValue(new Error('Cancel failed'));

      await adapter.cancelRequest('request-123');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to cancel request:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('cancelAllRequests', () => {
    it('should cancel all requests', async () => {
      await adapter.cancelAllRequests();

      expect(mockNativeModule.cancelAllRequests).toHaveBeenCalled();
    });

    it('should handle cancel errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockNativeModule.cancelAllRequests.mockRejectedValue(new Error('Cancel all failed'));

      await adapter.cancelAllRequests();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to cancel all requests:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('platform availability', () => {
    it('should throw error on non-iOS platforms', async () => {
      jest.doMock('react-native', () => ({
        Platform: { OS: 'android' },
        NativeModules: {},
      }));

      const AndroidAdapter = require('../ios-urlsession.adapter').IOSURLSessionAdapter;
      const androidAdapter = new AndroidAdapter();

      await expect(androidAdapter.request({
        url: 'https://api.example.com/test',
        method: 'GET',
      })).rejects.toThrow('URLSession adapter is only available on iOS');
    });
  });
});
