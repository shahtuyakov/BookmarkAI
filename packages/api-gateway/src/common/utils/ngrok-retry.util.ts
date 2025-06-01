/**
 * ngrok Retry Logic Utility
 * 
 * Implements client-side retry logic for ngrok-specific errors as defined in ADR-010.
 * This utility provides exponential backoff and smart error detection for tunnel-related issues.
 */

export interface RetryConfig {
  retries: number;
  retryDelay: (attempt: number) => number;
  retryCondition: (error: any) => boolean;
}

export interface ApiRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * ngrok-specific error codes that should trigger retries
 */
export const NGROK_ERROR_CODES = {
  TUNNEL_OFFLINE: 502,        // Bad Gateway - tunnel is down
  BANDWIDTH_EXCEEDED: 402,    // Payment Required - bandwidth limit
  CONNECTION_TIMEOUT: 504,    // Gateway Timeout - connection issues
  BAD_GATEWAY: 502,          // Bad Gateway - tunnel connectivity
  SERVICE_UNAVAILABLE: 503,   // Service Unavailable - temporary issues
} as const;

/**
 * Exponential delay function for retry backoff
 * @param baseDelay Base delay in milliseconds (default: 1000ms)
 * @returns Function that calculates delay for given attempt
 */
export function exponentialDelay(baseDelay: number = 1000) {
  return (attempt: number): number => {
    const delay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
    return Math.min(delay + jitter, 30000); // Cap at 30 seconds
  };
}

/**
 * Default retry condition for ngrok-specific errors
 * @param error The error to check
 * @returns True if the error should trigger a retry
 */
export function isNgrokRetryableError(error: any): boolean {
  if (!error || typeof error.status !== 'number') {
    return false;
  }

  const retryableCodes = Object.values(NGROK_ERROR_CODES);
  return retryableCodes.includes(error.status);
}

/**
 * Default retry configuration for ngrok errors
 */
export const defaultNgrokRetryConfig: RetryConfig = {
  retries: 3,
  retryCondition: isNgrokRetryableError,
  retryDelay: exponentialDelay(1000), // 1s, 2s, 4s progression
};

/**
 * Enhanced retry configuration for critical operations
 */
export const aggressiveNgrokRetryConfig: RetryConfig = {
  retries: 5,
  retryCondition: isNgrokRetryableError,
  retryDelay: exponentialDelay(500), // 0.5s, 1s, 2s, 4s, 8s progression
};

/**
 * Sleep utility for delay implementation
 * @param ms Milliseconds to sleep
 */
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic HTTP client with retry logic
 * This is a basic implementation - replace with your preferred HTTP client (axios, fetch, etc.)
 */
export class NgrokRetryClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, defaultHeaders: Record<string, string> = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.defaultHeaders = defaultHeaders;
  }

  /**
   * Make an API call with retry logic for ngrok-specific errors
   * @param request The API request configuration
   * @param retryConfig Optional retry configuration (uses default if not provided)
   * @returns Promise resolving to the API response
   */
  async request<T = any>(
    request: ApiRequest,
    retryConfig: RetryConfig = defaultNgrokRetryConfig
  ): Promise<ApiResponse<T>> {
    let lastError: ApiError;

    for (let attempt = 1; attempt <= retryConfig.retries + 1; attempt++) {
      try {
        const response = await this.executeRequest<T>(request);
        
        // Log successful retry for monitoring
        if (attempt > 1) {
          console.log(`🔄 ngrok request succeeded on attempt ${attempt}`, {
            url: request.url,
            method: request.method,
            attempt,
          });
        }
        
        return response;
        
      } catch (error) {
        const apiError = this.normalizeError(error);
        lastError = apiError;

        // Check if we should retry this error
        const shouldRetry = retryConfig.retryCondition(apiError);
        const isLastAttempt = attempt === retryConfig.retries + 1;

        if (!shouldRetry || isLastAttempt) {
          // Log final failure for monitoring
          console.error('❌ ngrok request failed (no more retries)', {
            url: request.url,
            method: request.method,
            status: apiError.status,
            attempt,
            willRetry: false,
          });
          throw apiError;
        }

        // Calculate delay and wait before retry
        const delay = retryConfig.retryDelay(attempt);
        
        console.warn(`⚠️ ngrok request failed, retrying in ${delay}ms`, {
          url: request.url,
          method: request.method,
          status: apiError.status,
          attempt,
          nextAttempt: attempt + 1,
          delay,
        });

        await sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Execute the actual HTTP request
   * Replace this implementation with your preferred HTTP client
   */
  private async executeRequest<T>(request: ApiRequest): Promise<ApiResponse<T>> {
    const url = request.url.startsWith('http') 
      ? request.url 
      : `${this.baseUrl}${request.url}`;

    const headers = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...request.headers,
    };

    const fetchOptions: RequestInit = {
      method: request.method,
      headers,
      signal: request.timeout ? AbortSignal.timeout(request.timeout) : undefined,
    };

    if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
      fetchOptions.body = typeof request.body === 'string' 
        ? request.body 
        : JSON.stringify(request.body);
    }

    const response = await fetch(url, fetchOptions);

    let data: T;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text() as unknown as T;
    }

    if (!response.ok) {
      throw new ApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText,
        data
      );
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  /**
   * Normalize different error types to ApiError
   */
  private normalizeError(error: any): ApiError {
    if (error instanceof ApiError) {
      return error;
    }

    if (error instanceof TypeError && error.message.includes('fetch')) {
      // Network error (tunnel might be down)
      return new ApiError(
        'Network error - tunnel may be offline',
        NGROK_ERROR_CODES.TUNNEL_OFFLINE,
        'Bad Gateway',
        error
      );
    }

    if (error.name === 'AbortError') {
      // Timeout error
      return new ApiError(
        'Request timeout',
        NGROK_ERROR_CODES.CONNECTION_TIMEOUT,
        'Gateway Timeout',
        error
      );
    }

    // Unknown error
    return new ApiError(
      error.message || 'Unknown error',
      500,
      'Internal Server Error',
      error
    );
  }
}

/**
 * Convenience function for making API calls with ngrok retry logic
 * @param request The API request configuration
 * @param retryConfig Optional retry configuration
 * @returns Promise resolving to the API response
 */
export async function apiCallWithNgrokRetry<T = any>(
  request: ApiRequest,
  retryConfig: RetryConfig = defaultNgrokRetryConfig
): Promise<ApiResponse<T>> {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001/api';
  const client = new NgrokRetryClient(baseUrl);
  return client.request<T>(request, retryConfig);
}

/**
 * Type-safe wrapper for common API operations
 */
export const ngrokApi = {
  get: <T = any>(url: string, headers?: Record<string, string>) =>
    apiCallWithNgrokRetry<T>({ url, method: 'GET', headers }),

  post: <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    apiCallWithNgrokRetry<T>({ url, method: 'POST', body, headers }),

  put: <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    apiCallWithNgrokRetry<T>({ url, method: 'PUT', body, headers }),

  delete: <T = any>(url: string, headers?: Record<string, string>) =>
    apiCallWithNgrokRetry<T>({ url, method: 'DELETE', headers }),

  patch: <T = any>(url: string, body?: any, headers?: Record<string, string>) =>
    apiCallWithNgrokRetry<T>({ url, method: 'PATCH', body, headers }),
};