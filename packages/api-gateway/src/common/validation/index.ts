/**
 * Validation schemas and utilities following ADR-012 conventions
 */

// Re-export all schemas
export * from './pagination.schema';
export * from './shares.schema';
export * from './auth.schema';

// Re-export validation utilities
export * from '../pipes/zod-validation.pipe';
export * from '../decorators/validation.decorator';
export * from '../utils/field-selection.util';

// Common validation schemas
import { z } from 'zod';

/**
 * Common request headers schema
 */
export const CommonHeadersSchema = z.object({
  'x-request-id': z.string().uuid().optional(),
  'idempotency-key': z.string().uuid().optional(),
  'user-agent': z.string().optional(),
  accept: z.string().optional(),
  'content-type': z.string().optional(),
});

/**
 * Health check response schema
 */
export const HealthCheckSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  timestamp: z.string().datetime(),
  version: z.string().optional(),
  checks: z
    .record(
      z.object({
        status: z.enum(['up', 'down']),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Feature flags response schema
 */
export const FeatureFlagsSchema = z.record(
  z.union([z.boolean(), z.string(), z.number(), z.null()]),
);

/**
 * Async operation status schema
 */
export const AsyncOperationSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  statusUrl: z.string().url(),
  progress: z
    .object({
      current: z.number().int().min(0),
      total: z.number().int().min(0),
    })
    .optional(),
  result: z.any().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.any().optional(),
    })
    .optional(),
});

/**
 * Common validation error codes
 */
export const VALIDATION_ERROR_CODES = {
  INVALID_FIELD: 'INVALID_FIELD_VALUE',
  INVALID_EMAIL: 'INVALID_EMAIL_FORMAT',
  INVALID_URL: 'INVALID_URL',
  INVALID_UUID: 'INVALID_UUID',
  INVALID_DATE: 'INVALID_DATE_FORMAT',
  INVALID_REQUEST_BODY: 'INVALID_REQUEST_BODY',
  INVALID_QUERY_PARAMS: 'INVALID_QUERY_PARAMS',
} as const;

/**
 * Type definitions
 */
export type CommonHeaders = z.infer<typeof CommonHeadersSchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type AsyncOperation = z.infer<typeof AsyncOperationSchema>;

/**
 * Validation utilities
 */
export class ValidationUtils {
  /**
   * Transform Zod errors into user-friendly messages
   */
  static formatZodError(error: z.ZodError): string[] {
    return error.errors.map(err => {
      const path = err.path.length > 0 ? `${err.path.join('.')}: ` : '';
      return `${path}${err.message}`;
    });
  }

  /**
   * Check if a value is a valid UUID
   */
  static isValidUuid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  /**
   * Check if a value is a valid email
   */
  static isValidEmail(value: string): boolean {
    return z.string().email().safeParse(value).success;
  }

  /**
   * Check if a value is a valid URL
   */
  static isValidUrl(value: string): boolean {
    return z.string().url().safeParse(value).success;
  }

  /**
   * Sanitize string input
   */
  static sanitizeString(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  /**
   * Validate cursor format
   */
  static isValidCursor(cursor: string): boolean {
    const cursorRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-zA-Z0-9-_]+$/;
    return cursorRegex.test(cursor);
  }
}
