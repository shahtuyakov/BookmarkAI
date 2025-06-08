import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import {
  ApiResponse,
  ApiResponseMeta,
  successResponse,
} from '../interfaces/api-response.interface';
import { ConfigService } from '../../config/services/config.service';

/**
 * Interceptor to wrap all responses in standard envelope format as per ADR-012
 * Adds metadata including requestId, version, and deprecation notices
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  private apiVersion: string;

  constructor(private configService: ConfigService) {
    this.apiVersion = this.configService.get('API_VERSION', '1.0.0');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<unknown>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const response = ctx.getResponse<FastifyReply>();

    // Get or generate request ID
    const requestId =
      (request.headers['x-request-id'] as string) || (request as { id?: string }).id || uuidv4();

    // Store request ID for later use in error handling
    (request as { id?: string }).id = requestId;

    // Set response headers
    response.header('X-Request-ID', requestId);

    // Check for deprecation header from route metadata
    const handler = context.getHandler();
    const deprecation = Reflect.getMetadata('deprecation', handler);
    const sunset = Reflect.getMetadata('sunset', handler);

    if (deprecation) {
      response.header('Deprecation', deprecation);
    }
    if (sunset) {
      response.header('Sunset', sunset);
    }

    return next.handle().pipe(
      map(data => {
        // If already in envelope format (has success property), enhance with metadata
        if (data && typeof data === 'object' && 'success' in data) {
          const meta: ApiResponseMeta = {
            requestId,
            version: this.apiVersion,
            ...(data.meta || {}),
            ...(deprecation ? { deprecation } : {}),
          };

          return {
            ...data,
            meta,
          };
        }

        // Special handling for pagination responses
        if (data && typeof data === 'object' && 'items' in data && 'hasMore' in data) {
          const meta: ApiResponseMeta = {
            requestId,
            version: this.apiVersion,
            ...(deprecation ? { deprecation } : {}),
          };

          return successResponse(data, meta);
        }

        // Wrap non-envelope responses
        const meta: ApiResponseMeta = {
          requestId,
          version: this.apiVersion,
          ...(deprecation ? { deprecation } : {}),
        };

        return successResponse(data, meta);
      }),
    );
  }
}
