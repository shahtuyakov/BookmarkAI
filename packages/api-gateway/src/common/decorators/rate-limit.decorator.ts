import { SetMetadata, UseInterceptors, applyDecorators } from '@nestjs/common';
import {
  RateLimitInterceptor,
  RateLimitConfig,
  RATE_LIMIT_POLICIES,
} from '../interceptors/rate-limit.interceptor';

/**
 * Rate limiting decorators following ADR-012 conventions
 */

// Metadata key for rate limit configuration
export const RATE_LIMIT_KEY = 'rate-limit';

/**
 * Apply rate limiting to an endpoint with custom configuration
 */
export function RateLimit(config: RateLimitConfig) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, config),
    UseInterceptors(RateLimitInterceptor),
  );
}

/**
 * Apply strict rate limiting for authentication endpoints
 */
export function AuthRateLimit() {
  return RateLimit(RATE_LIMIT_POLICIES.AUTH);
}

/**
 * Apply standard API rate limiting
 */
export function ApiRateLimit() {
  return RateLimit(RATE_LIMIT_POLICIES.API);
}

/**
 * Apply rate limiting for share creation endpoints
 */
export function ShareCreateRateLimit() {
  return RateLimit(RATE_LIMIT_POLICIES.SHARE_CREATE);
}

/**
 * Apply rate limiting for batch operations
 */
export function BatchRateLimit() {
  return RateLimit(RATE_LIMIT_POLICIES.BATCH);
}

/**
 * Apply rate limiting for upload endpoints
 */
export function UploadRateLimit() {
  return RateLimit(RATE_LIMIT_POLICIES.UPLOAD);
}

/**
 * Custom rate limiting with specific limits
 */
export function CustomRateLimit(options: {
  windowMinutes?: number;
  windowSeconds?: number;
  max: number;
  message?: string;
}) {
  const windowMs = options.windowMinutes
    ? options.windowMinutes * 60 * 1000
    : (options.windowSeconds || 60) * 1000;

  return RateLimit({
    windowMs,
    max: options.max,
    message: options.message || 'Too many requests',
    policy: `custom-${options.max}/${windowMs / 1000}s`,
  });
}

/**
 * Disable rate limiting for specific endpoints
 */
export function NoRateLimit() {
  return SetMetadata(RATE_LIMIT_KEY, { disabled: true });
}

/**
 * Rate limiting for different user tiers
 */
export function TieredRateLimit(options: {
  free: { max: number; windowMs: number };
  premium: { max: number; windowMs: number };
  enterprise: { max: number; windowMs: number };
}) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, { tiered: true, tiers: options }),
    UseInterceptors(RateLimitInterceptor),
  );
}

/**
 * Burst rate limiting (short window, high limit + longer window, lower limit)
 */
export function BurstRateLimit(options: {
  burst: { max: number; windowMs: number };
  sustained: { max: number; windowMs: number };
}) {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, { burst: true, ...options }),
    UseInterceptors(RateLimitInterceptor),
  );
}

/**
 * IP-based rate limiting (ignores authentication)
 */
export function IpRateLimit(config: Omit<RateLimitConfig, 'keyGenerator'>) {
  return RateLimit({
    ...config,
    keyGenerator: req => `ip:${req.ip}:${(req as Record<string, unknown>).routerPath || req.url}`,
  });
}

/**
 * User-based rate limiting (requires authentication)
 */
export function UserRateLimit(config: Omit<RateLimitConfig, 'keyGenerator'>) {
  return RateLimit({
    ...config,
    keyGenerator: req => {
      const userId = (req as Record<string, unknown>).user?.id;
      if (!userId) {
        throw new Error('User-based rate limiting requires authentication');
      }
      return `user:${userId}:${(req as Record<string, unknown>).routerPath || req.url}`;
    },
  });
}

/**
 * Global rate limiting (applies to all requests from an IP/user)
 */
export function GlobalRateLimit(config: RateLimitConfig) {
  return RateLimit({
    ...config,
    keyGenerator: req => {
      const userId = (req as Record<string, unknown>).user?.id;
      const identifier = userId || req.ip;
      return `global:${identifier}`;
    },
  });
}

/**
 * Endpoint-specific rate limiting
 */
export function EndpointRateLimit(config: RateLimitConfig) {
  return RateLimit({
    ...config,
    keyGenerator: req => {
      const userId = (req as Record<string, unknown>).user?.id;
      const identifier = userId || req.ip;
      const endpoint = (req as Record<string, unknown>).routerPath || req.url;
      return `endpoint:${identifier}:${endpoint}`;
    },
  });
}

/**
 * Combined decorators for common patterns
 */
export const RateLimiting = {
  /**
   * Standard API endpoint rate limiting
   */
  Standard: () => ApiRateLimit(),

  /**
   * Authentication endpoint rate limiting
   */
  Auth: () => AuthRateLimit(),

  /**
   * Resource creation rate limiting
   */
  Create: () => ShareCreateRateLimit(),

  /**
   * Batch operation rate limiting
   */
  Batch: () => BatchRateLimit(),

  /**
   * Upload endpoint rate limiting
   */
  Upload: () => UploadRateLimit(),

  /**
   * No rate limiting
   */
  None: () => NoRateLimit(),

  /**
   * Custom rate limiting
   */
  Custom: (max: number, windowMinutes: number = 1) => CustomRateLimit({ max, windowMinutes }),
};
