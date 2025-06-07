import { RequestInterceptor, ResponseInterceptor } from './types';
import { RequestConfig, Response } from '../adapters/types';

/**
 * Interceptor that adds tracing headers for distributed tracing
 */
export class TracingInterceptor implements RequestInterceptor, ResponseInterceptor {
  private generateTraceId(): string {
    // Generate a 32-character hex trace ID
    return Array.from({ length: 32 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  private generateSpanId(): string {
    // Generate a 16-character hex span ID
    return Array.from({ length: 16 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  onRequest(config: RequestConfig): RequestConfig {
    // Add tracing headers if not already present
    const traceId = config.headers?.['x-trace-id'] || this.generateTraceId();
    const spanId = this.generateSpanId();

    return {
      ...config,
      headers: {
        ...config.headers,
        'x-trace-id': traceId,
        'x-span-id': spanId,
        'x-parent-span-id': config.headers?.['x-span-id'] || '',
      },
    };
  }

  onResponse<T>(response: Response<T>): Response<T> {
    // Log trace information if needed
    const traceId = response.headers['x-trace-id'];
    if (traceId) {
      // Could send to telemetry service here
    }
    return response;
  }
}