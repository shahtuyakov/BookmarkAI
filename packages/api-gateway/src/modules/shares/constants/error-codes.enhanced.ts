/**
 * Enhanced error codes for the shares module
 * Provides more specific error codes for edge cases
 */
export const ERROR_CODES = {
    // URL related errors
    INVALID_URL: 'INVALID_URL',
    UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
    MALFORMED_URL: 'MALFORMED_URL',
    URL_TOO_LONG: 'URL_TOO_LONG',
    
    // Idempotency related errors
    IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
    IDEMPOTENCY_KEY_INVALID: 'IDEMPOTENCY_KEY_INVALID',
    IDEMPOTENCY_KEY_TOO_LONG: 'IDEMPOTENCY_KEY_TOO_LONG',
    
    // Share related errors
    SHARE_NOT_FOUND: 'SHARE_NOT_FOUND',
    SHARE_ACCESS_DENIED: 'SHARE_ACCESS_DENIED',
    DUPLICATE_SHARE: 'DUPLICATE_SHARE',
    
    // Rate limiting errors
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    
    // Authorization errors
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_INVALID: 'TOKEN_INVALID',
    
    // General errors
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    SERVER_ERROR: 'SERVER_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR'
  };
  
  /**
   * Maps error codes to HTTP status codes and messages
   */
  export const ERROR_DETAILS = {
    // URL related errors
    [ERROR_CODES.INVALID_URL]: {
      status: 400,
      message: 'The provided URL is invalid. Please provide a valid HTTPS URL.',
    },
    [ERROR_CODES.UNSUPPORTED_PLATFORM]: {
      status: 400,
      message: 'The URL is not from a supported platform. Supported platforms: TikTok, Reddit, Twitter, X.',
    },
    [ERROR_CODES.MALFORMED_URL]: {
      status: 400,
      message: 'The URL format is malformed or contains invalid characters.',
    },
    [ERROR_CODES.URL_TOO_LONG]: {
      status: 400,
      message: 'The provided URL exceeds the maximum allowed length of 2048 characters.',
    },
    
    // Idempotency related errors
    [ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED]: {
      status: 400,
      message: 'An Idempotency-Key header is required for this request.',
    },
    [ERROR_CODES.IDEMPOTENCY_KEY_INVALID]: {
      status: 400,
      message: 'The provided Idempotency-Key is invalid. It should be a UUID v4 format.',
    },
    [ERROR_CODES.IDEMPOTENCY_KEY_TOO_LONG]: {
      status: 400,
      message: 'The provided Idempotency-Key exceeds the maximum allowed length of 100 characters.',
    },
    
    // Share related errors
    [ERROR_CODES.SHARE_NOT_FOUND]: {
      status: 404,
      message: 'The requested share could not be found.',
    },
    [ERROR_CODES.SHARE_ACCESS_DENIED]: {
      status: 403,
      message: 'You do not have permission to access this share.',
    },
    [ERROR_CODES.DUPLICATE_SHARE]: {
      status: 409,
      message: 'This URL has already been shared by you.',
    },
    
    // Rate limiting errors
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: {
      status: 429,
      message: 'Rate limit exceeded. Please try again later.',
    },
    
    // Authorization errors
    [ERROR_CODES.TOKEN_EXPIRED]: {
      status: 401,
      message: 'Your authentication token has expired. Please log in again.',
    },
    [ERROR_CODES.TOKEN_INVALID]: {
      status: 401,
      message: 'Invalid authentication token provided.',
    },
    
    // General errors
    [ERROR_CODES.VALIDATION_ERROR]: {
      status: 400,
      message: 'The request contains invalid parameters.',
    },
    [ERROR_CODES.SERVER_ERROR]: {
      status: 500,
      message: 'An unexpected error occurred. Please try again later.',
    },
    [ERROR_CODES.DATABASE_ERROR]: {
      status: 500,
      message: 'A database error occurred while processing your request.',
    },
  };