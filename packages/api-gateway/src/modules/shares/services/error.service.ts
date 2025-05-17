import { 
    HttpException, 
    BadRequestException,
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    InternalServerErrorException,
    HttpStatus
  } from '@nestjs/common';
  import { ERROR_CODES, ERROR_DETAILS } from '../constants/error-codes.enhanced';
  import { ApiResponse, errorResponse } from '../interfaces/api-response.interface';
  
  /**
   * Utility class for consistent error handling
   */
  export class ErrorService {
    /**
     * Throw an error with the appropriate HTTP status code and formatted response
     * @param code Error code from ERROR_CODES enum
     * @param customMessage Optional custom message to override default
     * @param metadata Optional additional metadata for debugging
     */
    static throwError(code: string, customMessage?: string, metadata?: any): never {
      // Get the error details or use defaults
      const details = ERROR_DETAILS[code] || {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Unknown error occurred'
      };
      
      // Create formatted error response
      const response = errorResponse(
        code, 
        customMessage || details.message, 
        metadata
      );
      
      // Select appropriate exception type based on status code
      switch (details.status) {
        case HttpStatus.BAD_REQUEST:
          throw new BadRequestException(response);
        case HttpStatus.UNAUTHORIZED:
          throw new UnauthorizedException(response);
        case HttpStatus.FORBIDDEN:
          throw new ForbiddenException(response);
        case HttpStatus.NOT_FOUND:
          throw new NotFoundException(response);
        case HttpStatus.CONFLICT:
          throw new ConflictException(response);
        case HttpStatus.TOO_MANY_REQUESTS:
          throw new HttpException(response, HttpStatus.TOO_MANY_REQUESTS);
        case HttpStatus.INTERNAL_SERVER_ERROR:
        default:
          throw new InternalServerErrorException(response);
      }
    }
    
    /**
     * Parse database errors and throw appropriate exceptions
     * @param error The original error object
     */
    static handleDatabaseError(error: any): never {
      // PostgreSQL unique constraint violation
      if (error.code === '23505') {
        // Extract constraint name for more specific errors
        const constraint = error.constraint || '';
        
        if (constraint.includes('shares_url_user_id')) {
          return this.throwError(
            ERROR_CODES.DUPLICATE_SHARE,
            'You have already shared this URL'
          );
        }
        
        if (constraint.includes('idempotency_key')) {
          return this.throwError(
            ERROR_CODES.DUPLICATE_SHARE,
            'This request has already been processed'
          );
        }
      }
      
      // PostgreSQL foreign key violation
      if (error.code === '23503') {
        return this.throwError(
          ERROR_CODES.VALIDATION_ERROR,
          'Referenced record does not exist'
        );
      }
      
      // Generic database error
      return this.throwError(
        ERROR_CODES.DATABASE_ERROR,
        'A database error occurred',
        process.env.NODE_ENV === 'development' ? { originalError: error.message } : undefined
      );
    }
    
    /**
     * Validate URL and throw appropriate errors
     * @param url URL to validate
     */
    static validateUrl(url: string): void {
      // Check URL length
      if (url.length > 2048) {
        this.throwError(ERROR_CODES.URL_TOO_LONG);
      }
      
      try {
        const urlObj = new URL(url);
        
        // Validate protocol
        if (urlObj.protocol !== 'https:') {
          this.throwError(ERROR_CODES.INVALID_URL, 'URL must use HTTPS protocol');
        }
        
        // Validate domain
        const supportedDomains = ['tiktok.com', 'reddit.com', 'twitter.com', 'x.com'];
        const domain = urlObj.hostname.replace(/^www\./, '');
        
        if (!supportedDomains.some(d => domain.endsWith(d))) {
          this.throwError(ERROR_CODES.UNSUPPORTED_PLATFORM);
        }
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        this.throwError(ERROR_CODES.MALFORMED_URL);
      }
    }
    
    /**
     * Validate idempotency key
     * @param key Idempotency key to validate
     */
    static validateIdempotencyKey(key: string): void {
      if (!key) {
        this.throwError(ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED);
      }
      
      if (key.length > 100) {
        this.throwError(ERROR_CODES.IDEMPOTENCY_KEY_TOO_LONG);
      }
      
      // Validate UUID format (basic check)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
        this.throwError(
          ERROR_CODES.IDEMPOTENCY_KEY_INVALID,
          'Idempotency key should be a valid UUID'
        );
      }
    }
  }