import { applyDecorators } from '@nestjs/common';
import { ApiResponse, ApiResponseOptions } from '@nestjs/swagger';

/**
 * Custom decorator to simplify Swagger response documentation
 */
export function SwaggerResponse(options: ApiResponseOptions): MethodDecorator {
  return applyDecorators(ApiResponse(options));
}