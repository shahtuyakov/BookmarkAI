import { 
    ExceptionFilter, 
    Catch, 
    ArgumentsHost, 
    HttpException, 
    Logger,
    HttpStatus
  } from '@nestjs/common';
  import { ERROR_CODES } from '../../modules/shares/constants/error-codes.enhanced';
  import { errorResponse } from '../../modules/shares/interfaces/api-response.interface';
  
  /**
   * Global exception filter to standardize error responses
   */
  @Catch()
  export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);
  
    catch(exception: any, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse();
      
      let status = HttpStatus.INTERNAL_SERVER_ERROR;
      let errorResponse = {
        success: false,
        error: {
          code: ERROR_CODES.SERVER_ERROR,
          message: 'Internal server error'
        }
      };
  
      // Handle NestJS HTTP exceptions
      if (exception instanceof HttpException) {
        status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
        
        // If our response format is already applied (from our ErrorService)
        if (typeof exceptionResponse === 'object' && 
            exceptionResponse.hasOwnProperty('success') && 
            exceptionResponse.hasOwnProperty('error')) {
          errorResponse = exceptionResponse as any;
        } 
        // Handle validation errors from class-validator
        else if (typeof exceptionResponse === 'object' && 
            exceptionResponse.hasOwnProperty('message')) {
          
          const responseObj = exceptionResponse as any;
          
          errorResponse = {
            success: false,
            error: {
              code: ERROR_CODES.VALIDATION_ERROR,
              message: Array.isArray(responseObj.message) 
                ? responseObj.message[0] 
                : responseObj.message || 'Validation error'
            }
          };
          
          // If there are multiple validation errors, add them as details
          if (Array.isArray(responseObj.message) && responseObj.message.length > 1) {
            // @ts-ignore - we're adding details dynamically
            errorResponse.error.details = { validationErrors: responseObj.message };
          }
        } 
        // Other HTTP exceptions
        else {
          errorResponse = {
            success: false,
            error: {
              code: this.getErrorCodeFromStatus(status),
              message: typeof exceptionResponse === 'string' 
                ? exceptionResponse 
                : exception.message
            }
          };
        }
      }
      // Handle MongoDB errors
      else if (exception.name === 'MongoError' || exception.name === 'MongoServerError') {
        if (exception.code === 11000) { // Duplicate key error
          status = HttpStatus.CONFLICT;
          errorResponse = {
            success: false,
            error: {
              code: ERROR_CODES.DUPLICATE_SHARE,
              message: 'This item already exists'
            }
          };
        }
      }
      // Handle PostgreSQL errors
      else if (exception.code && typeof exception.code === 'string' && 
               exception.code.startsWith('22') || exception.code.startsWith('23')) {
        status = HttpStatus.BAD_REQUEST;
        
        if (exception.code === '23505') { // Unique violation
          status = HttpStatus.CONFLICT;
          errorResponse = {
            success: false,
            error: {
              code: ERROR_CODES.DUPLICATE_SHARE,
              message: 'This item already exists'
            }
          };
        } else {
          errorResponse = {
            success: false,
            error: {
              code: ERROR_CODES.DATABASE_ERROR,
              message: 'Database constraint violation'
            }
          };
        }
      }
      
      // Log the exception for server-side troubleshooting
      if (status >= 500) {
        this.logger.error(
          `Unhandled exception: ${exception.message}`,
          exception.stack
        );
      } else {
        this.logger.warn(
          `Client error (${status}): ${errorResponse.error.message}`
        );
      }
      
      // Send the response to the client
      response
        .status(status)
        .send(errorResponse);
    }
    
    /**
     * Map HTTP status codes to error codes
     */
    private getErrorCodeFromStatus(status: number): string {
      switch (status) {
        case HttpStatus.BAD_REQUEST:
          return ERROR_CODES.VALIDATION_ERROR;
        case HttpStatus.UNAUTHORIZED:
          return ERROR_CODES.TOKEN_INVALID;
        case HttpStatus.FORBIDDEN:
          return ERROR_CODES.SHARE_ACCESS_DENIED;
        case HttpStatus.NOT_FOUND:
          return ERROR_CODES.SHARE_NOT_FOUND;
        case HttpStatus.CONFLICT:
          return ERROR_CODES.DUPLICATE_SHARE;
        case HttpStatus.TOO_MANY_REQUESTS:
          return ERROR_CODES.RATE_LIMIT_EXCEEDED;
        default:
          return ERROR_CODES.SERVER_ERROR;
      }
    }
  }