import { NetworkAdapter, RequestConfig, Response } from '@bookmarkai/sdk';

/**
 * Browser extension network adapter that implements the SDK NetworkAdapter interface
 * Uses the browser's fetch API with extension-specific handling
 */
export class BrowserExtensionNetworkAdapter implements NetworkAdapter {
  private defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  /**
   * Make HTTP request using browser's fetch API
   */
  async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    const {
      url,
      method,
      headers = {},
      params,
      data,
      timeout = this.defaultTimeout,
    } = config;

    // Build URL with query parameters
    let requestUrl = url;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      requestUrl = `${url}?${searchParams.toString()}`;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Prepare request options
      const requestOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        signal: controller.signal,
      };

      // Add body for methods that support it
      if (data && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        requestOptions.body = typeof data === 'string' ? data : JSON.stringify(data);
      }

      // Make the request
      const response = await fetch(requestUrl, requestOptions);

      // Clear timeout
      clearTimeout(timeoutId);

      // Parse response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Parse response body
      let responseData: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        // For non-JSON responses, return text as data
        responseData = (await response.text()) as unknown as T;
      }

      // Create response object
      const result: Response<T> = {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };

      // Handle non-2xx status codes
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as any).response = result;
        throw error;
      }

      return result;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${timeout}ms`);
        (timeoutError as any).code = 'TIMEOUT';
        throw timeoutError;
      }

      // Handle network errors
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        const networkError = new Error('Network error: Failed to fetch');
        (networkError as any).code = 'NETWORK_ERROR';
        throw networkError;
      }

      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Check if network is available (utility method)
   */
  async isOnline(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }

    try {
      // Try to fetch a small resource
      await fetch('https://dns.google/resolve?name=example.com', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get network status (utility method)
   */
  getNetworkInfo(): {
    online: boolean;
    type?: string;
    effectiveType?: string;
    saveData?: boolean;
  } {
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    return {
      online: navigator.onLine,
      type: connection?.type,
      effectiveType: connection?.effectiveType,
      saveData: connection?.saveData,
    };
  }
}