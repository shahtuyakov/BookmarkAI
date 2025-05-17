import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, successResponse } from '../../modules/shares/interfaces/api-response.interface';

/**
 * Interceptor to standardize API responses
 * Ensures all responses follow the format: { success: boolean, data?: any, error?: { code: string, message: string } }
 */
@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<any>> {
    return next.handle().pipe(
      map(data => {
        // If the response is already in the correct format, return it as is
        if (data && (data.success === true || data.success === false)) {
          return data;
        }
        
        // Otherwise, wrap it in a success response
        return successResponse(data);
      }),
    );
  }
}