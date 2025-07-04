# ADR-211: Worker-Level Rate Limiting and Back-off Strategy

**Status**: Accepted  
**Date**: 2025-01-03  
**Decision makers**: Backend Team, Infrastructure Team  
**Related ADRs**: ADR-005 (BullMQ Worker Design), ADR-021 (Content Fetcher Interface), ADR-025 (Python ML Microservice Framework)

## Implementation Summary (MVP)

**Implemented on**: 2025-01-04  
**Phases completed**: Phase 1 (Core Infrastructure) ✅, Phase 2 (ShareProcessor Integration) ✅

### What's Working:
- Distributed rate limiter with Redis backing (sliding window & token bucket algorithms)
- ShareProcessor checks rate limits before external API calls
- Smart requeue with exponential backoff and jitter
- Circuit breaker pattern for Redis failures
- Prometheus metrics for monitoring
- YAML configuration with hot reload

### Known Limitations:
- **Global rate limiting only** - all users share same limit pool (scaling issue)
- No per-user fairness (first 100 shares win, rest queue)
- Single API key per platform (no pooling)
- ML service integration pending (Phase 3)

## Context

BookmarkAI's worker processes interact with various external APIs and services, each with their own rate limits and quotas. Currently, rate limiting is well-implemented at the API gateway level for incoming requests, but worker-level rate limiting for outbound requests to external services is missing or incomplete.

### Current State Analysis

#### What We Have

1. **API Gateway Rate Limiting** (✅ Complete)
   - Decorator-based rate limiting for all endpoints
   - Redis-backed with proper headers
   - Multiple strategies (auth, API, batch, upload)

2. **SDK Client Rate Limiting** (✅ Complete)
   - Token bucket implementation
   - Exponential backoff with jitter
   - Retry-After header support

3. **ML Producer Circuit Breaker** (⚡ Partial)
   - Connection-level circuit breaker
   - Exponential backoff for RabbitMQ
   - No rate limiting for external API calls

4. **BullMQ Basic Retry** (⚠️ Basic)
   - Fixed 3 attempts with exponential backoff
   - No platform-specific considerations

#### What We're Missing

1. **Platform API Rate Limits**
   - TikTok: Unknown limits, no documentation
   - Reddit: 60 requests/minute (OAuth apps)
   - Twitter/X: Tier-based (300-500 requests/15min)
   - YouTube: Daily quota system (10,000 units default)

2. **ML Service API Limits**
   - OpenAI: RPM/TPM limits vary by tier
   - Anthropic: Requests per minute limits
   - Whisper API: Concurrent request limits
   - Embedding APIs: Batch size restrictions

3. **Coordination Across Workers**
   - No shared rate limit state
   - No priority queue management
   - No adaptive back-off strategies

### Problem Statement

Without proper worker-level rate limiting:
- **Cost Overruns**: Excessive API calls leading to unexpected bills
- **Service Degradation**: Rate limit errors causing failed jobs
- **Poor User Experience**: Shares stuck in processing due to rate limits
- **Inefficient Resource Use**: Workers blocked on rate-limited APIs

## Decision

Implement a comprehensive worker-level rate limiting system with the following components:

### 1. Distributed Rate Limiter Service

Create a centralized rate limiting service using Redis that all workers can query:

```typescript
interface RateLimitConfig {
  service: string;           // e.g., 'reddit', 'openai', 'tiktok'
  limits: {
    requests: number;
    window: number;         // in seconds
    burst?: number;         // optional burst capacity
  }[];
  backoffStrategy: {
    type: 'exponential' | 'linear' | 'adaptive';
    initialDelay: number;
    maxDelay: number;
    multiplier?: number;
  };
}
```

### 2. Worker Rate Limit Integration

Enhance workers to check rate limits before making external calls:

```typescript
// In ShareProcessor
async processShare(job: Job) {
  const platform = share.platform;
  
  // Check rate limit before fetching
  const canProceed = await this.rateLimiter.checkLimit(platform);
  if (!canProceed) {
    // Requeue with delay
    const delay = await this.rateLimiter.getBackoffDelay(platform);
    throw new RateLimitError(`Rate limited for ${platform}`, { delay });
  }
  
  try {
    const result = await fetcher.fetchContent(request);
    await this.rateLimiter.recordSuccess(platform);
  } catch (error) {
    if (isRateLimitError(error)) {
      await this.rateLimiter.recordRateLimit(platform, error);
    }
    throw error;
  }
}
```

### 3. ML Service Rate Limiting

Implement similar controls for ML services:

```python
# In Python ML services
class RateLimitedAPIClient:
    def __init__(self, service_name: str, redis_client: Redis):
        self.service = service_name
        self.limiter = DistributedRateLimiter(redis_client, service_name)
    
    async def make_request(self, *args, **kwargs):
        # Check rate limit
        if not await self.limiter.check_limit():
            delay = await self.limiter.get_backoff_delay()
            raise RateLimitError(f"Rate limited for {self.service}", delay=delay)
        
        try:
            result = await self._do_request(*args, **kwargs)
            await self.limiter.record_success()
            return result
        except RateLimitError as e:
            await self.limiter.record_rate_limit(e)
            raise
```

### 4. Queue Management Strategy

Implement intelligent queue management:

1. **Priority Queues**: Separate queues for rate-limited vs available capacity
2. **Delayed Requeuing**: Automatic requeue with appropriate delays
3. **Capacity-Based Scheduling**: Schedule jobs based on available API capacity

### 5. Configuration Schema

Store rate limit configurations in a centralized location:

```yaml
# config/rate-limits.yaml
services:
  reddit:
    limits:
      - requests: 60
        window: 60  # 60 requests per minute
    backoff:
      type: exponential
      initialDelay: 1000
      maxDelay: 60000
      multiplier: 2
      
  openai:
    limits:
      - requests: 500
        window: 60  # RPM limit
      - tokens: 150000
        window: 60  # TPM limit
    backoff:
      type: adaptive
      initialDelay: 2000
      maxDelay: 300000
      
  tiktok:
    limits:
      - requests: 100
        window: 60  # Conservative estimate
    backoff:
      type: exponential
      initialDelay: 5000
      maxDelay: 300000
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
1. Create distributed rate limiter service
2. Add Redis data structures for tracking
3. Implement basic check/record methods

### Phase 2: Worker Integration (Week 2)
1. Integrate rate limiter into ShareProcessor
2. Add rate limit error handling
3. Implement requeue with delays

### Phase 3: ML Service Integration (Week 3)
1. Python rate limiter client
2. Integrate into LLM, Whisper, Vector services
3. Add token counting for LLM services

### Phase 4: Monitoring & Optimization (Week 4)
1. Add Prometheus metrics
2. Create Grafana dashboards
3. Implement adaptive strategies

## Consequences

### Positive
- **Cost Control**: Prevents API quota overages
- **Better Reliability**: Graceful handling of rate limits
- **Improved Throughput**: Optimal use of available API capacity
- **Operational Visibility**: Clear metrics on API usage

### Negative
- **Added Complexity**: Another system to maintain
- **Potential Latency**: Rate limit checks add overhead
- **Configuration Burden**: Need to maintain rate limit configs

### Risks and Mitigations

1. **Risk**: Redis becomes single point of failure
   - **Mitigation**: Use Redis Cluster, implement fallback to local limits

2. **Risk**: Incorrect rate limit configuration
   - **Mitigation**: Conservative defaults, monitoring alerts, gradual rollout

3. **Risk**: Thundering herd after back-off
   - **Mitigation**: Jitter in back-off delays, staggered job scheduling

## Alternatives Considered

1. **Local Rate Limiting**: Each worker tracks its own limits
   - Rejected: No coordination, inefficient use of quota

2. **API Gateway Proxy**: Route all external calls through gateway
   - Rejected: Adds latency, single point of failure

3. **Third-party Service**: Use service like Kong or Envoy
   - Rejected: Operational complexity, cost

## Metrics and Monitoring

Key metrics to track:
- Rate limit hits per service
- Queue depth by platform
- API capacity utilization
- Back-off delay distribution
- Failed jobs due to rate limits

## Implementation Status

**Last Updated**: 2025-01-04

### ⚠️ MVP Limitation: Global Rate Limiting

The current implementation uses **global platform-wide rate limits**, which works for MVP but has scaling issues:
- With 10k users: First 100 shares process, remaining 9,900 queue behind rate limit
- All users share the same rate limit pool (e.g., 100 TikTok requests/min total)

**Production requirements** (not implemented):
- Per-user rate limiting for fairness
- API key pooling for higher throughput
- Priority queues based on user tiers

## Implementation TODO List

### Phase 1: Core Infrastructure ✅ COMPLETED
- [x] **1.1** Create `DistributedRateLimiter` service class in `packages/api-gateway/src/common/rate-limiter/`
  - [x] Implement sliding window counter using Redis sorted sets (LUA script)
  - [x] Add token bucket algorithm for burst capacity (with cost support)
  - [x] Create methods: `checkLimit()`, `recordUsage()`, `getBackoffDelay()`
- [x] **1.2** Define rate limit configuration schema
  - [x] Create `config/rate-limits.yaml` with initial conservative limits
  - [x] Add configuration loader service with hot-reload capability
  - [x] Implement environment variable support (CACHE_HOST, CACHE_PORT)
- [x] **1.3** Set up Redis data structures
  - [x] Design key naming convention: `rl:{sw|tb}:{service}:{identifier}`
  - [x] Implement TTL for automatic key expiration
  - [x] Add Redis connection with circuit breaker pattern

### Phase 2: ShareProcessor Integration ✅ COMPLETED
- [x] **2.1** Create `WorkerRateLimiter` wrapper service
  - [x] Inject into ShareProcessor
  - [x] Add platform-specific rate limit checks before fetcher calls
  - [x] Implement error classification (RateLimitError → RetryableFetcherError)
- [x] **2.2** Enhance BullMQ job handling
  - [x] Add custom `RateLimitError` class with retry information
  - [x] Implement smart requeue with calculated delays (with jitter)
  - [x] Convert rate limit errors to platform-consistent errors
- [x] **2.3** Update error handling ✅ COMPLETED
  - [x] Wrap external API calls with rate limit checks
  - [x] Parse rate limit headers helper (in WorkerRateLimiter)
  - [x] Update rate limit state based on API responses
    - Extended FetchResponse interface to include responseHeaders
    - Updated all fetchers (Reddit, TikTok, Generic) to pass through headers
    - ShareProcessor now calls updateFromResponse after successful fetches

### Phase 3: ML Service Integration
- [x] **3.1** Create Python rate limiter package in `python/shared/` ✅ COMPLETED
  - [x] Port DistributedRateLimiter logic to Python
    - Created distributed_rate_limiter.py with Redis-based implementation
    - Supports both sliding window and token bucket algorithms
    - Compatible with Node.js implementation for cross-service rate limiting
    - Fixed sliding window bug where cost parameter wasn't properly handled
  - [x] Add async Redis client integration
    - Uses redis.asyncio for async operations
    - Includes circuit breaker pattern for Redis failures
  - [x] Create decorators for rate-limited methods
    - @rate_limit decorator for easy function decoration
    - RateLimitedClient base class for API clients
    - Support for both sync and async functions
  - [x] Add production-ready features:
    - Prometheus metrics for monitoring (rate_limit_checks_total, usage_ratio, backoff_seconds)
    - Circuit breaker status tracking
    - Redis operation timing metrics
    - Audit logging for rate limit decisions
- [ ] **3.2** Integrate with LLM service
  - [ ] Add token counting for OpenAI/Anthropic
  - [ ] Implement request/token dual limits
  - [ ] Add cost tracking integration
- [ ] **3.3** Integrate with Whisper service
  - [ ] Add concurrent request limiting
  - [ ] Implement file size-based rate limiting
  - [ ] Add queue depth monitoring
- [ ] **3.4** Integrate with Vector service
  - [ ] Add batch size optimization
  - [ ] Implement embedding cache to reduce API calls
  - [ ] Add fallback to local models on rate limit

### Phase 4: Monitoring & Alerting
- [ ] **4.1** Add Prometheus metrics
  - [ ] `rate_limit_checks_total{service,result}`
  - [ ] `rate_limit_usage_ratio{service}`
  - [ ] `rate_limit_backoff_seconds{service}`
  - [ ] `api_quota_remaining{service}`
- [ ] **4.2** Create Grafana dashboards
  - [ ] Rate limit overview dashboard
  - [ ] Per-service usage dashboard
  - [ ] Cost projection dashboard
- [ ] **4.3** Set up alerts
  - [ ] Alert on >80% rate limit usage
  - [ ] Alert on sustained rate limiting
  - [ ] Alert on unexpected 429 errors

### Phase 5: Advanced Features
- [ ] **5.1** Implement adaptive back-off
  - [ ] Track success/failure patterns
  - [ ] Adjust delays based on recent history
  - [ ] Add time-of-day awareness
- [ ] **5.2** Add priority queue management
  - [ ] Create separate queues for rate-limited platforms
  - [ ] Implement capacity-based job scheduling
  - [ ] Add premium user priority handling
- [ ] **5.3** Create rate limit simulator
  - [ ] Tool to test rate limit configurations
  - [ ] Load testing with rate limit constraints
  - [ ] Capacity planning calculator

### Testing & Documentation
- [ ] **T.1** Unit tests for DistributedRateLimiter
- [ ] **T.2** Integration tests with Redis
- [ ] **T.3** End-to-end tests with mock APIs
- [ ] **T.4** Load tests to verify rate limit accuracy
- [ ] **D.1** API documentation for rate limiter service
- [ ] **D.2** Runbook for rate limit troubleshooting
- [ ] **D.3** Platform-specific rate limit documentation

### Migration & Rollout
- [ ] **M.1** Feature flag for gradual rollout
- [ ] **M.2** Dry-run mode (log only, don't block)
- [ ] **M.3** Rollout plan: Internal → Beta → Production
- [ ] **M.4** Rollback procedure documentation

## Future Enhancements for Production Scale

### User-Based Rate Limiting
- [ ] **U.1** Implement per-user rate limits
  - [ ] Modify key structure: `rl:{service}:{userId}:{identifier}`
  - [ ] Add user fairness algorithm
  - [ ] Prevent single user from blocking others
- [ ] **U.2** Tiered rate limits by user plan
  - [ ] Premium users: Higher limits
  - [ ] Free users: Conservative limits
  - [ ] Enterprise: Custom limits

### API Key Pooling
- [ ] **P.1** Multiple API key management
  - [ ] Round-robin key selection
  - [ ] Key health monitoring
  - [ ] Automatic key rotation on rate limit
- [ ] **P.2** Dynamic key allocation
  - [ ] Allocate keys based on load
  - [ ] Reserve keys for premium users

### Queue Optimization
- [ ] **Q.1** Platform-specific queue priorities
  - [ ] Separate queues per platform
  - [ ] Priority based on user tier
  - [ ] Backpressure handling
- [ ] **Q.2** Smart job distribution
  - [ ] Distribute jobs across available capacity
  - [ ] Predictive scheduling based on rate limit reset times

## References

- [Redis Rate Limiting Patterns](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Token Bucket Algorithm](https://en.wikipedia.org/wiki/Token_bucket)
- [Platform API Limits Documentation](internal-wiki/api-limits)