import { SetMetadata, applyDecorators } from '@nestjs/common';
import { ApiResponse as SwaggerApiResponse, ApiHeader } from '@nestjs/swagger';

/**
 * Decorator to mark an endpoint as deprecated
 */
export function ApiDeprecated(deprecationDate: string, sunsetDate?: string) {
  const decorators = [
    SetMetadata('deprecation', deprecationDate),
    ApiHeader({
      name: 'Deprecation',
      description: 'Deprecation date',
      example: deprecationDate,
    }),
  ];

  if (sunsetDate) {
    decorators.push(
      SetMetadata('sunset', sunsetDate),
      ApiHeader({
        name: 'Sunset',
        description: 'API shutdown date',
        example: sunsetDate,
      }),
    );
  }

  return applyDecorators(...decorators);
}

/**
 * Decorator for standard API response documentation
 */
export function ApiStandardResponse(
  type: { name: string },
  description: string = 'Successful response',
) {
  return applyDecorators(
    SwaggerApiResponse({
      status: 200,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: `#/components/schemas/${type.name}` },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
              version: { type: 'string', example: '1.0.0' },
              deprecation: { type: 'string', example: '2026-01-01T00:00:00.000Z' },
            },
          },
        },
      },
    }),
  );
}

/**
 * Decorator for paginated response documentation
 */
export function ApiPaginatedResponse(
  itemType: { name: string },
  description: string = 'Paginated response',
) {
  return applyDecorators(
    SwaggerApiResponse({
      status: 200,
      description,
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: { $ref: `#/components/schemas/${itemType.name}` },
              },
              cursor: { type: 'string', example: '2025-06-09T12:00:00.000Z_abc123' },
              hasMore: { type: 'boolean', example: true },
              limit: { type: 'number', example: 20 },
              total: { type: 'number', example: 100, nullable: true },
            },
          },
          meta: {
            type: 'object',
            properties: {
              requestId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
              version: { type: 'string', example: '1.0.0' },
            },
          },
        },
      },
    }),
  );
}

/**
 * Decorator for error response documentation
 */
export function ApiErrorResponse(
  status: number,
  code: string,
  message: string,
  description: string = 'Error response',
) {
  return SwaggerApiResponse({
    status,
    description,
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: code },
            message: { type: 'string', example: message },
            details: {
              type: 'object',
              nullable: true,
              example: { field: 'email', constraint: 'must be valid email' },
            },
            timestamp: { type: 'string', example: new Date().toISOString() },
            traceId: { type: 'string', example: '123e4567-e89b-12d3-a456-426614174000' },
          },
        },
      },
    },
  });
}

/**
 * Common error response decorators
 */
export const ApiCommonErrors = () =>
  applyDecorators(
    ApiErrorResponse(400, 'INVALID_REQUEST_BODY', 'Invalid request body', 'Bad Request'),
    ApiErrorResponse(401, 'AUTH_TOKEN_INVALID', 'Invalid access token', 'Unauthorized'),
    ApiErrorResponse(403, 'FORBIDDEN_RESOURCE_ACCESS', 'Access forbidden', 'Forbidden'),
    ApiErrorResponse(404, 'NOT_FOUND_RESOURCE', 'Resource not found', 'Not Found'),
    ApiErrorResponse(429, 'RATE_LIMIT_EXCEEDED', 'Too many requests', 'Rate Limited'),
    ApiErrorResponse(500, 'SERVER_INTERNAL_ERROR', 'Internal server error', 'Server Error'),
  );
