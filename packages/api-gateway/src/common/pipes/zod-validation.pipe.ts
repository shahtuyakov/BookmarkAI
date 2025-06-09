import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { ValidationException } from '../exceptions/api.exceptions';
import { ERROR_CODES, ErrorCode } from '../constants/error-codes';

/**
 * Custom validation pipe using Zod that integrates with ADR-012 error handling
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        // Transform Zod errors into our standardized format
        const firstError = error.errors[0];
        const field = firstError.path.join('.');

        throw new ValidationException(this.getErrorCode(firstError), firstError.message, {
          field,
          constraint: this.getConstraintMessage(firstError),
          suggestion: this.getSuggestion(firstError),
          validation: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
      }
      throw error;
    }
  }

  /**
   * Map Zod error codes to our error taxonomy
   */
  private getErrorCode(zodIssue: ZodIssue): ErrorCode {
    switch (zodIssue.code) {
      case 'invalid_string':
        if ('validation' in zodIssue) {
          if (zodIssue.validation === 'email') {
            return ERROR_CODES.INVALID_EMAIL_FORMAT;
          }
          if (zodIssue.validation === 'url') {
            return ERROR_CODES.INVALID_URL;
          }
          if (zodIssue.validation === 'uuid') {
            return ERROR_CODES.INVALID_UUID;
          }
        }
        return ERROR_CODES.INVALID_FIELD_VALUE;
      case 'invalid_type':
        return ERROR_CODES.INVALID_FIELD_VALUE;
      case 'too_small':
      case 'too_big':
        return ERROR_CODES.INVALID_FIELD_VALUE;
      case 'invalid_date':
        return ERROR_CODES.INVALID_DATE_FORMAT;
      case 'custom':
        return ERROR_CODES.INVALID_FIELD_VALUE;
      default:
        return ERROR_CODES.INVALID_REQUEST_BODY;
    }
  }

  /**
   * Generate constraint message based on Zod error
   */
  private getConstraintMessage(error: ZodIssue): string {
    switch (error.code) {
      case 'too_small':
        if (error.type === 'string') {
          return `must be at least ${error.minimum} characters`;
        }
        if (error.type === 'number') {
          return `must be at least ${error.minimum}`;
        }
        if (error.type === 'array') {
          return `must contain at least ${error.minimum} items`;
        }
        return `minimum value: ${error.minimum}`;

      case 'too_big':
        if (error.type === 'string') {
          return `must not exceed ${error.maximum} characters`;
        }
        if (error.type === 'number') {
          return `must not exceed ${error.maximum}`;
        }
        if (error.type === 'array') {
          return `must not contain more than ${error.maximum} items`;
        }
        return `maximum value: ${error.maximum}`;

      case 'invalid_date':
        return 'must be a valid date';

      case 'invalid_string':
        if ('validation' in error) {
          if (error.validation === 'email') {
            return 'must be a valid email address';
          }
          if (error.validation === 'url') {
            return 'must be a valid URL';
          }
          if (error.validation === 'uuid') {
            return 'must be a valid UUID';
          }
          if (error.validation === 'regex') {
            return 'must match the required format';
          }
        }
        return 'must be a valid string';

      case 'invalid_type':
        return `must be of type ${error.expected}`;

      default:
        return error.message || 'invalid value';
    }
  }

  /**
   * Generate helpful suggestions for common validation errors
   */
  private getSuggestion(error: ZodIssue): string | undefined {
    switch (error.code) {
      case 'invalid_date':
        return 'Use ISO 8601 format: 2025-06-09T14:30:00.000Z';

      case 'invalid_string':
        if ('validation' in error) {
          if (error.validation === 'email') {
            return 'Example: user@example.com';
          }
          if (error.validation === 'url') {
            if (error.path.includes('url')) {
              return 'Supported platforms: tiktok.com, reddit.com, twitter.com, x.com';
            }
            return 'Example: https://example.com';
          }
          if (error.validation === 'uuid') {
            return 'Example: 123e4567-e89b-12d3-a456-426614174000';
          }
        }
        break;

      case 'too_small':
        if (error.type === 'string' && error.path.includes('password')) {
          return 'Use a mix of uppercase, lowercase, numbers, and special characters';
        }
        break;

      case 'custom':
        if (error.message.includes('platform')) {
          return 'Supported platforms: tiktok, reddit, twitter, x';
        }
        if (error.message.includes('cursor')) {
          return 'Use the cursor from the previous response';
        }
        break;
    }

    return undefined;
  }
}

/**
 * Factory function to create validation pipe for a specific schema
 */
export function ZodValidation(schema: ZodSchema) {
  return new ZodValidationPipe(schema);
}
