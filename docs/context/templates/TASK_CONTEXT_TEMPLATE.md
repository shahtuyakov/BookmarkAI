# Task Context: [Task ID] - [Task Name]

## Basic Information
- **Phase**: [Phase Number] - [Phase Name]
- **Owner**: [Developer Name]
- **Status**: [Progress percentage]
- **Started**: [Start Date]
- **Target Completion**: [Target Date]
- **Dependencies**: [List task IDs this depends on]
- **Dependent Tasks**: [List task IDs that depend on this]

## Requirements
- [Key requirement 1]
- [Key requirement 2]
- [Key requirement 3]

## Implementation Approach
- [Approach detail 1]
- [Approach detail 2]
- [Approach detail 3]

## Current Implementation
```[language]
// Code snippet representing current implementation
```

## Challenges & Decisions
- [Date]: [Decision made and reasoning]
- [Date]: [Challenge encountered and approach]

## Questions & Notes
- [Open question or note]
- [Another question or note]

## Related Resources
- PR: [PR links]
- Documentation: [Links to relevant docs]
- References: [External references or research]

---

# SAMPLE FILLED TASK CONTEXT

# Task Context: 2.11 - Implement rate-limit/back-off logic

## Basic Information
- **Phase**: 2 - Metadata + Caption Fetch
- **Owner**: Alex Chen
- **Status**: 80% complete
- **Started**: 2025-05-19
- **Target Completion**: 2025-05-22
- **Dependencies**: 2.1 (Content fetcher interfaces), 2.2-2.4 (Platform-specific fetchers)
- **Dependent Tasks**: 2.10 (Connect fetchers to orchestration), 3.2 (Whisper transcription)

## Requirements
- Create shared utility for handling rate limits across social media platforms
- Implement exponential backoff with configurable parameters
- Store rate limit state persistently to handle worker restarts
- Create platform-specific adapters for different API header formats
- Provide consistent interface for all content fetchers

## Implementation Approach
- Build RateLimitManager class with Redis backing store
- Use exponential backoff with jitter to prevent thundering herd
- Store both explicit rate limits from API responses and implicit tracking
- Create platform-specific adapters that parse headers correctly
- Implement connection pooling for Redis to handle concurrent requests

## Current Implementation
```typescript
export class RateLimitManager {
  constructor(
    private readonly redis: Redis,
    private readonly options: RateLimitOptions = defaultOptions
  ) {}

  async shouldRateLimit(platform: Platform, apiKey: string): Promise<RateLimitResult> {
    const key = `ratelimit:${platform}:${apiKey}`;
    const info = await this.redis.hgetall(key);
    
    // Check remaining requests
    if (info.remaining && parseInt(info.remaining, 10) <= 0) {
      const resetTime = parseInt(info.reset, 10);
      const now = Math.floor(Date.now() / 1000);
      
      if (now < resetTime) {
        return {
          limited: true,
          retryAfter: (resetTime - now) * 1000,
          reason: 'API rate limit exceeded'
        };
      }
    }
    
    // Check if we're backing off due to errors
    if (info.backoffUntil) {
      const backoffUntil = parseInt(info.backoffUntil, 10);
      if (Date.now() < backoffUntil) {
        return {
          limited: true,
          retryAfter: backoffUntil - Date.now(),
          reason: 'Backing off due to previous errors',
          attempt: parseInt(info.attempt, 10)
        };
      }
    }
    
    return { limited: false };
  }
  
  async updateRateLimits(platform: Platform, apiKey: string, response: PlatformResponse): Promise<void> {
    const adapter = this.getAdapter(platform);
    const limits = adapter.extractRateLimits(response);
    
    if (limits) {
      const key = `ratelimit:${platform}:${apiKey}`;
      await this.redis.hset(key, limits);
      await this.redis.expire(key, 24 * 60 * 60); // 24 hour TTL
    }
  }
  
  async recordError(platform: Platform, apiKey: string, statusCode: number): Promise<void> {
    // Current implementation for handling errors and backoff...
  }
  
  private calculateBackoff(attempt: number): number {
    const { baseDelay, maxDelay, jitterAmount } = this.options;
    const jitter = Math.random() * jitterAmount;
    return Math.min(maxDelay, baseDelay * Math.pow(2, attempt) + jitter);
  }
  
  private getAdapter(platform: Platform): RateLimitAdapter {
    // Return the appropriate adapter for the platform
  }
}
```

## Challenges & Decisions
- 2025-05-19: Decided to use Redis instead of in-memory storage to handle worker restarts
- 2025-05-20: Discovered TikTok sends rate limit headers in milliseconds while Reddit uses seconds
- 2025-05-21: Facing Redis connection timeout issues under load - exploring connection pooling

## Questions & Notes
- Should we implement request batching to reduce Redis operations?
- Consider adding Prometheus metrics for rate limit events
- Need to determine if we should share rate limits across all workers or partition by instance

## Related Resources
- PR: #123 - Initial implementation
- Documentation: [Internal Link: Rate Limiting Strategy]
- References: 
  - [Twitter API rate limiting documentation](https://developer.twitter.com/en/docs/twitter-api/rate-limits)
  - [Redis connection pooling best practices](https://redis.io/docs/manual/client-side-caching/)