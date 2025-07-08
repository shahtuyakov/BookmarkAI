export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
  cost?: number;
}

export type RateLimitAlgorithm = 'sliding_window' | 'token_bucket';

export interface BackoffStrategy {
  type: 'exponential' | 'linear' | 'adaptive';
  initialDelay: number;
  maxDelay: number;
  multiplier?: number;
  jitter?: boolean;
}

export interface RateLimitRule {
  // For sliding window
  requests?: number;
  window?: number;
  
  // For token bucket
  capacity?: number;
  refillRate?: number;
  
  // For both
  burst?: number;
}

export interface CostMapping {
  [key: string]: number;
}

export interface RateLimitConfig {
  service: string;
  algorithm: RateLimitAlgorithm;
  limits: RateLimitRule[];
  backoff: BackoffStrategy;
  costMapping?: CostMapping;
  keyGenerator?: (...args: any[]) => string;
  costCalculator?: (...args: any[]) => number;
  ttl?: number; // TTL for Redis keys in seconds
}

export interface RateLimitOptions {
  identifier?: string;
  cost?: number;
  metadata?: Record<string, any>;
}

export interface RateLimiterService {
  checkLimit(
    service: string,
    options?: RateLimitOptions,
  ): Promise<RateLimitResult>;
  
  recordUsage(
    service: string,
    cost?: number,
  ): Promise<void>;
  
  getBackoffDelay(
    service: string,
    identifier?: string,
  ): Promise<number>;
  
  reset(
    service: string,
    identifier?: string,
  ): Promise<void>;
}