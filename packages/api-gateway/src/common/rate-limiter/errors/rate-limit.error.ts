export class RateLimitError extends Error {
  constructor(
    message: string,
    public readonly service: string,
    public readonly retryAfter: number,
    public readonly resetAt: number,
    public readonly remaining: number = 0,
  ) {
    super(message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      service: this.service,
      retryAfter: this.retryAfter,
      resetAt: this.resetAt,
      remaining: this.remaining,
    };
  }
}

export class RateLimiterUnavailableError extends Error {
  constructor(message: string = 'Rate limiter service is unavailable') {
    super(message);
    this.name = 'RateLimiterUnavailableError';
    Object.setPrototypeOf(this, RateLimiterUnavailableError.prototype);
  }
}