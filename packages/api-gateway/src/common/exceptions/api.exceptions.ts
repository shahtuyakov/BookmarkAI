import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../constants/error-codes';

// Type for error details
type ErrorDetails = Record<string, unknown>;

/**
 * Base API exception that follows ADR-012 error format
 */
export class ApiException extends HttpException {
  constructor(code: ErrorCode, message: string, status: HttpStatus, details?: ErrorDetails) {
    super(
      {
        code,
        message,
        details,
      },
      status,
    );
  }
}

/**
 * Validation exception for request validation errors
 */
export class ValidationException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.BAD_REQUEST, details);
  }
}

/**
 * Authentication exception
 */
export class AuthenticationException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.UNAUTHORIZED, details);
  }
}

/**
 * Authorization exception
 */
export class AuthorizationException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.FORBIDDEN, details);
  }
}

/**
 * Not found exception
 */
export class NotFoundException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.NOT_FOUND, details);
  }
}

/**
 * Conflict exception
 */
export class ConflictException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.CONFLICT, details);
  }
}

/**
 * Rate limit exception
 */
export class RateLimitException extends ApiException {
  constructor(code: ErrorCode, message: string, retryAfter?: number) {
    super(code, message, HttpStatus.TOO_MANY_REQUESTS, retryAfter ? { retryAfter } : undefined);
  }
}

/**
 * External service exception
 */
export class ExternalServiceException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.SERVICE_UNAVAILABLE, details);
  }
}

/**
 * Server error exception
 */
export class ServerErrorException extends ApiException {
  constructor(code: ErrorCode, message: string, details?: any) {
    super(code, message, HttpStatus.INTERNAL_SERVER_ERROR, details);
  }
}
