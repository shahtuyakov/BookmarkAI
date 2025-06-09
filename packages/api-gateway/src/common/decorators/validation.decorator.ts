import { createParamDecorator, ExecutionContext, UsePipes } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

/**
 * Parameter decorators for validating different parts of the request
 */

/**
 * Validate request body with Zod schema
 */
export function ValidatedBody(schema: ZodSchema) {
  return function (target: object, propertyKey: string, parameterIndex: number) {
    (UsePipes(new ZodValidationPipe(schema)) as ParameterDecorator)(
      target,
      propertyKey,
      parameterIndex,
    );
  };
}

/**
 * Validate query parameters with Zod schema
 */
export function ValidatedQuery(schema: ZodSchema) {
  return function (target: object, propertyKey: string, parameterIndex: number) {
    (UsePipes(new ZodValidationPipe(schema)) as ParameterDecorator)(
      target,
      propertyKey,
      parameterIndex,
    );
  };
}

/**
 * Validate route parameters with Zod schema
 */
export function ValidatedParams(schema: ZodSchema) {
  return function (target: object, propertyKey: string, parameterIndex: number) {
    (UsePipes(new ZodValidationPipe(schema)) as ParameterDecorator)(
      target,
      propertyKey,
      parameterIndex,
    );
  };
}

/**
 * Extract and validate request ID from headers
 */
export const RequestId = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  // Request ID is set by our middleware
  return request.id || 'unknown';
});

/**
 * Extract and validate idempotency key from headers
 */
export const IdempotencyKey = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.headers['idempotency-key'];
  },
);

/**
 * Extract user ID from JWT token
 */
export const UserId = createParamDecorator((data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.id;
});

/**
 * Extract full user object from JWT token
 */
export const CurrentUser = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});

/**
 * Validate headers with Zod schema
 */
export function ValidatedHeaders(schema: ZodSchema) {
  return createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return schema.parse(request.headers);
  });
}

/**
 * Utility decorator to combine multiple validation decorators
 */
export function ValidatedEndpoint(options: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}) {
  return function (target: object, propertyKey: string, _descriptor: PropertyDescriptor) {
    // This is a method decorator that can be used to document validation requirements
    // The actual validation happens through parameter decorators
    Reflect.defineMetadata('validation:schemas', options, target, propertyKey);
  };
}

/**
 * Decorator to mark fields as optional in responses based on query.fields parameter
 */
export const FieldSelection = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const fields = request.query?.fields;

    if (!fields) return undefined;

    // Fields can be comma-separated string or array
    if (typeof fields === 'string') {
      return fields
        .split(',')
        .map(f => f.trim())
        .filter(Boolean);
    }

    if (Array.isArray(fields)) {
      return fields;
    }

    return undefined;
  },
);

/**
 * Type-safe parameter validation decorator factory
 */
export function Validated<T extends ZodSchema>(schema: T) {
  return {
    Body: () => ValidatedBody(schema),
    Query: () => ValidatedQuery(schema),
    Params: () => ValidatedParams(schema),
    Headers: () => ValidatedHeaders(schema),
  };
}
