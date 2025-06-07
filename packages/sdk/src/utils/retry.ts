export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: (error: any) => boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: (error) => {
    // Retry on network errors and 5xx status codes
    if (error.code === 'NETWORK_ERROR') return true;
    if (error.status >= 500) return true;
    if (error.status === 429) return true; // Rate limited
    return false;
  },
};

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: any;
  let delay = finalConfig.initialDelay;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if we should retry
      if (attempt === finalConfig.maxRetries) {
        break; // No more retries
      }

      if (!finalConfig.retryableErrors?.(error)) {
        throw error; // Not retryable
      }

      // Check for Retry-After header
      let waitTime = delay;
      if (error.retryAfter) {
        waitTime = error.retryAfter * 1000; // Convert seconds to ms
      }

      // Wait before next attempt
      await sleep(Math.min(waitTime, finalConfig.maxDelay));

      // Calculate next delay with exponential backoff
      delay = Math.min(
        delay * finalConfig.backoffMultiplier,
        finalConfig.maxDelay
      );
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Sleep for the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add jitter to a delay value to prevent thundering herd
 */
export function addJitter(delay: number, jitterFactor: number = 0.1): number {
  const jitter = delay * jitterFactor;
  return delay + (Math.random() * 2 - 1) * jitter;
}