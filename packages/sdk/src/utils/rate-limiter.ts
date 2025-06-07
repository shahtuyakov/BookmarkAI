/**
 * Token bucket rate limiter implementation
 * Allows burst of requests up to bucket size, then refills at specified rate
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private bucketSize: number,
    private refillRate: number, // tokens per second
    private refillInterval: number = 1000 // milliseconds
  ) {
    this.tokens = bucketSize;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token, returns true if successful
   */
  tryConsume(count: number = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available
   */
  async waitForToken(count: number = 1): Promise<void> {
    while (!this.tryConsume(count)) {
      const tokensNeeded = count - this.tokens;
      const timeToWait = Math.ceil(
        (tokensNeeded / this.refillRate) * 1000
      );
      
      await new Promise(resolve => setTimeout(resolve, Math.min(timeToWait, this.refillInterval)));
    }
  }

  /**
   * Get the current number of available tokens
   */
  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Reset the rate limiter to full capacity
   */
  reset(): void {
    this.tokens = this.bucketSize;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.refillInterval) {
      const tokensToAdd = (elapsed / 1000) * this.refillRate;
      this.tokens = Math.min(this.bucketSize, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
}

/**
 * Rate limiter specifically configured for BookmarkAI API
 * 10 requests per 10 seconds
 */
export class BookmarkAIRateLimiter extends RateLimiter {
  constructor() {
    super(10, 1); // 10 tokens bucket, 1 token per second refill
  }
}