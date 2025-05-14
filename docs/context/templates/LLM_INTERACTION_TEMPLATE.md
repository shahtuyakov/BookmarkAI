# LLM Interaction: [Topic/Question]

## Project Context
<!-- Copy relevant sections from PROJECT_CONTEXT.md -->
- **Phase**: [Current Phase]
- **Tech Stack**: [Relevant technologies]

## Task Context
<!-- If relevant, include task-specific information -->
- **Task ID**: [Task ID]
- **Current Status**: [Progress percentage]

## Current Challenge
<!-- Describe the specific challenge or question -->

## Code or Implementation Details
```[language]
// Include relevant code snippet here
```

## What I've Tried
<!-- List approaches already attempted -->
- [Approach 1]
- [Approach 2]

## Specific Question
<!-- Clearly state what you want from the LLM -->

---

# SAMPLE FILLED LLM INTERACTION

# LLM Interaction: Redis Connection Pooling for Rate Limiter

## Project Context
- **Phase**: 2 - Metadata + Caption Fetch (65% complete)
- **Tech Stack**: TypeScript, Redis, BullMQ
- **Component**: Task 2.11 - Rate-limit/back-off logic

## Task Context
- **Task ID**: 2.11 - Implement rate-limit/back-off logic
- **Current Status**: 80% complete
- **Description**: Creating a shared utility for handling rate limits across social media platforms with Redis persistence

## Current Challenge
I'm implementing a rate limiting service that needs to handle hundreds of concurrent requests checking against Redis. I'm seeing connection timeout errors when the system is under load, especially when multiple workers are checking rate limits simultaneously. The service needs to be highly reliable as it protects our external API usage.

## Code or Implementation Details
```typescript
// Current implementation for RateLimitManager
export class RateLimitManager {
  constructor(
    private readonly redis: Redis, // Using ioredis
    private readonly options: RateLimitOptions = defaultOptions
  ) {}

  async shouldRateLimit(platform: Platform, apiKey: string): Promise<RateLimitResult> {
    const key = `ratelimit:${platform}:${apiKey}`;
    const info = await this.redis.hgetall(key);
    
    // Check if rate limited based on info from Redis
    if (info.remaining && parseInt(info.remaining, 10) <= 0) {
      // Rate limited logic...
    }
    
    return { limited: false };
  }
  
  async updateRateLimits(platform: Platform, apiKey: string, response: PlatformResponse): Promise<void> {
    // Update rate limit info in Redis...
  }
}

// Usage in worker
const manager = new RateLimitManager(new Redis(redisConfig));

// This is called frequently from multiple workers
async function processTask(task) {
  const result = await manager.shouldRateLimit('tiktok', apiKey);
  if (result.limited) {
    // Requeue task
    return;
  }
  
  // Process task...
}
```

## What I've Tried
- Creating a new Redis connection for each manager (led to too many connections)
- Using a single connection for all operations (connection timeouts under load)
- Basic promise queuing to limit concurrent Redis operations (helped but still seeing issues)

## Specific Question
What's the best approach for handling high-concurrency Redis operations in a Node.js worker environment? I need a reliable connection pooling strategy that:

1. Efficiently manages Redis connections across multiple workers
2. Handles connection failures gracefully
3. Provides optimal performance for many small read/write operations
4. Works well with our existing ioredis implementation

Would you recommend a specific connection pooling library, or should I implement a custom solution? If custom, what pattern would you suggest?