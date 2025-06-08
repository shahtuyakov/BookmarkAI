import { NetworkAdapter, RequestConfig, Response } from './types';

/**
 * React Native network adapter using the built-in fetch API
 * with additional React Native specific handling
 */
export class ReactNativeNetworkAdapter implements NetworkAdapter {
  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    const { url, method, headers = {}, params, data, timeout = 30000 } = config;

    // Build URL with query params
    const urlWithParams = params
      ? `${url}?${new URLSearchParams(params).toString()}`
      : url;

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // React Native fetch with specific configuration
      const response = await fetch(urlWithParams, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...headers,
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: controller.signal,
        // React Native specific options
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      // Handle response
      let responseData: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json();
      } else {
        // Handle non-JSON responses
        const text = await response.text();
        responseData = text as any;
      }

      // Convert Headers to plain object
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle React Native specific errors
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      // Network connectivity error
      if (error.message === 'Network request failed') {
        throw new Error('No internet connection');
      }

      throw error;
    }
  }
}