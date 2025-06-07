import { NativeModules, Platform } from 'react-native';
import type { NetworkAdapter, RequestConfig, Response } from '@bookmarkai/sdk';

const { URLSessionNetworkAdapter: NativeURLSession } = NativeModules;

/**
 * iOS-specific network adapter using native URLSession
 * Provides better performance and certificate pinning support
 */
export class IOSURLSessionAdapter implements NetworkAdapter {
  private isAvailable: boolean;

  constructor() {
    this.isAvailable = Platform.OS === 'ios' && !!NativeURLSession;
    
    if (!this.isAvailable) {
      console.warn(
        'IOSURLSessionAdapter: Native module not available. ' +
        'Make sure the iOS native module is properly linked. ' +
        `Platform: ${Platform.OS}, Module available: ${!!NativeURLSession}`
      );
    }
  }

  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    if (!this.isAvailable) {
      throw new Error('URLSession adapter is only available on iOS');
    }

    try {
      // Convert params to query string
      let url = config.url;
      if (config.params) {
        const queryPairs: string[] = [];
        Object.entries(config.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
          }
        });
        if (queryPairs.length > 0) {
          url += (url.includes('?') ? '&' : '?') + queryPairs.join('&');
        }
      }

      // Prepare native request config
      const nativeConfig = {
        url,
        method: config.method,
        headers: config.headers || {},
        data: config.data,
        timeout: config.timeout,
      };

      // Make native request
      const nativeResponse = await NativeURLSession.request(nativeConfig);

      // Transform native response to SDK format
      const response: Response<T> = {
        data: nativeResponse.data,
        status: nativeResponse.status,
        statusText: this.getStatusText(nativeResponse.status),
        headers: this.normalizeHeaders(nativeResponse.headers),
      };

      // Handle non-2xx status codes
      if (response.status < 200 || response.status >= 300) {
        const error = new Error(`Request failed with status ${response.status}`);
        (error as any).response = response;
        throw error;
      }

      return response;
    } catch (error: any) {
      // Handle native module errors
      if (error.code) {
        switch (error.code) {
          case 'REQUEST_TIMEOUT':
            throw new Error('Request timeout');
          case 'NO_INTERNET':
            throw new Error('No internet connection');
          case 'REQUEST_CANCELLED':
            throw new Error('Request was cancelled');
          case 'INVALID_URL':
            throw new Error('Invalid URL');
          default:
            throw new Error(error.message || 'Network request failed');
        }
      }
      
      // Re-throw if it's already formatted
      if (error.response) {
        throw error;
      }
      
      // Generic error
      throw new Error(error.message || 'Unknown error occurred');
    }
  }

  /**
   * Cancel a specific request by ID
   * Note: This requires request tracking to be implemented
   */
  async cancelRequest(requestId: string): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    
    try {
      await NativeURLSession.cancelRequest(requestId);
    } catch (error) {
      console.warn('Failed to cancel request:', error);
    }
  }

  /**
   * Cancel all pending requests
   */
  async cancelAllRequests(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    
    try {
      await NativeURLSession.cancelAllRequests();
    } catch (error) {
      console.warn('Failed to cancel all requests:', error);
    }
  }

  /**
   * Normalize headers to lowercase keys
   */
  private normalizeHeaders(headers: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {};
    
    Object.entries(headers).forEach(([key, value]) => {
      normalized[key.toLowerCase()] = String(value);
    });
    
    return normalized;
  }

  /**
   * Get human-readable status text from status code
   */
  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      301: 'Moved Permanently',
      302: 'Found',
      304: 'Not Modified',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };

    return statusTexts[status] || 'Unknown Status';
  }
}