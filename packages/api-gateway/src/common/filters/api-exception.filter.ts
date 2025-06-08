import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ApiResponse, errorResponse } from '../interfaces/api-response.interface';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  ErrorCode,
  isRetryableError,
  getRetryAfterSeconds,
} from '../constants/error-codes';

/**
 * Custom exception filter that transforms all exceptions into ADR-012 compliant error responses
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    // Get request ID from request
    const requestId = (request as { id?: string }).id || 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: ErrorCode = ERROR_CODES.SERVER_INTERNAL_ERROR;
    let message = ERROR_MESSAGES[ERROR_CODES.SERVER_INTERNAL_ERROR];
    let details: Record<string, unknown> | undefined = undefined;

    // Handle different exception types
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        // Check if it's already our error format
        if (typeof responseObj.code === 'string' && typeof responseObj.message === 'string') {
          errorCode = responseObj.code as ErrorCode;
          message = responseObj.message;
          details = responseObj.details as Record<string, unknown> | undefined;
        } else {
          // Map status codes to error codes
          errorCode = this.mapStatusToErrorCode(status);
          message =
            (typeof responseObj.message === 'string' ? responseObj.message : undefined) ||
            ERROR_MESSAGES[errorCode];

          // Extract validation details if present
          if (responseObj.errors || responseObj.constraints) {
            details = {
              validation: responseObj.errors || responseObj.constraints,
            };
          }
        }
      } else {
        errorCode = this.mapStatusToErrorCode(status);
        message = exception.message || ERROR_MESSAGES[errorCode];
      }
    } else if (exception instanceof Error) {
      // Log unexpected errors
      this.logger.error(`Unexpected error: ${exception.message}`, exception.stack, { requestId });

      // Check for specific error types
      if (exception.message.includes('duplicate key')) {
        status = HttpStatus.CONFLICT;
        errorCode = ERROR_CODES.CONFLICT_DUPLICATE_EMAIL;
        message = 'Resource already exists';
      } else if (exception.message.includes('connection refused')) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        errorCode = ERROR_CODES.SERVER_DATABASE_ERROR;
        message = 'Service temporarily unavailable';
      }
    }

    // Create error response
    const errorObj = {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
    };

    const apiResponse: ApiResponse = errorResponse(errorObj, requestId);

    // Set response headers
    response.header('X-Request-ID', requestId);

    // Add retry headers if applicable
    if (isRetryableError(errorCode)) {
      const retryAfter = getRetryAfterSeconds(errorCode);
      if (retryAfter) {
        response.header('Retry-After', retryAfter.toString());
      }
    }

    // Send response
    response.status(status).send(apiResponse);
  }

  /**
   * Map HTTP status codes to error codes
   */
  private mapStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.INVALID_REQUEST_BODY;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.AUTH_TOKEN_INVALID;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN_RESOURCE_ACCESS;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND_RESOURCE;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.CONFLICT_RESOURCE_STATE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ERROR_CODES.RATE_LIMIT_EXCEEDED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ERROR_CODES.SERVER_INTERNAL_ERROR;
      default:
        return ERROR_CODES.SERVER_INTERNAL_ERROR;
    }
  }
}
