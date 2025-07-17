import { Platform } from '../../constants/platform.enum';

/**
 * Error codes for content fetching failures
 */
export enum FetcherErrorCode {
  // Permanent failures (no retry)
  CONTENT_NOT_FOUND = 'CONTENT_NOT_FOUND',
  CONTENT_PRIVATE = 'CONTENT_PRIVATE',
  INVALID_URL = 'INVALID_URL',
  PLATFORM_NOT_IMPLEMENTED = 'PLATFORM_NOT_IMPLEMENTED',
  PLATFORM_DISABLED = 'PLATFORM_DISABLED',
  UNSUPPORTED_CONTENT_TYPE = 'UNSUPPORTED_CONTENT_TYPE',
  INVALID_RESPONSE_FORMAT = 'INVALID_RESPONSE_FORMAT',
  
  // Temporary failures (retry with backoff)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Base error class for content fetchers
 */
export class FetcherError extends Error {
  constructor(
    message: string,
    public readonly code: FetcherErrorCode,
    public readonly platform: Platform,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'FetcherError';
  }

  /**
   * Check if this error should trigger a retry
   */
  isRetryable(): boolean {
    return [
      FetcherErrorCode.RATE_LIMIT_EXCEEDED,
      FetcherErrorCode.API_UNAVAILABLE,
      FetcherErrorCode.NETWORK_ERROR,
      FetcherErrorCode.TIMEOUT,
    ].includes(this.code);
  }
}

/**
 * Retryable error with suggested delay
 */
export class RetryableFetcherError extends FetcherError {
  constructor(
    message: string,
    code: FetcherErrorCode,
    platform: Platform,
    public readonly retryAfterSeconds: number = 60,
    details?: any
  ) {
    super(message, code, platform, details);
    this.name = 'RetryableFetcherError';
  }
}