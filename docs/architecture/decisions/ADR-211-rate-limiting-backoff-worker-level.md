# ADR-211: Worker-Level Rate Limiting and Back-off Strategy

**Status**: Accepted  
**Date**: 2025-01-03  
**Decision makers**: Backend Team, Infrastructure Team  
**Related ADRs**: ADR-005 (BullMQ Worker Design), ADR-021 (Content Fetcher Interface), ADR-025 (Python ML Microservice Framework)

## Implementation Summary (MVP)

**Implemented on**: 2025-01-04 - 2025-01-05  
**Phases completed**: 
- Phase 1 (Core Infrastructure) ✅
- Phase 2 (ShareProcessor Integration) ✅  
- Phase 3.1 (Python Rate Limiter) ✅
- Phase 3.2 (LLM Service Integration) ✅
- Phase 3.3 (Whisper Service Integration) ✅
- Phase 3.4 (Vector Service Integration) ✅
- Phase 4 (Monitoring & Alerting) ✅

### What's Working:
- Distributed rate limiter with Redis backing (sliding window & token bucket algorithms)
- ShareProcessor checks rate limits before external API calls
- Smart requeue with exponential backoff and jitter
- Circuit breaker pattern for Redis failures
- Prometheus metrics for monitoring
- YAML configuration with hot reload
- **LLM Service Rate Limiting**:
  - Token counting with tiktoken for accurate OpenAI usage
  - Dual rate limiting (RPM + TPM)
  - API key pooling with health tracking
  - Automatic key rotation on rate limits
- **Whisper Service Rate Limiting**:
  - Concurrent request limiting (semaphore-based)
  - Duration-based rate limiting (minutes)
  - Queue depth monitoring
  - Multi-API key support with rotation
- **Vector Service Rate Limiting**:
  - Intelligent batch optimization (up to 2048 texts/request)
  - Dual rate limiting (requests + tokens)
  - Redis-based embedding cache (24h TTL)
  - Cost-optimized model selection
- **Monitoring & Alerting**:
  - Comprehensive Prometheus metrics (usage ratio, backoff delays, API quotas)
  - Three Grafana dashboards (overview, per-service detail, cost projections)
  - 10 alerting rules covering rate limits, costs, and performance
  - Circuit breaker status monitoring
  - Redis operation latency tracking

### Known Limitations:
- **Global rate limiting only** - all users share same limit pool (scaling issue)
- No per-user fairness (first 100 shares win, rest queue)
- ~~Single API key per platform (no pooling)~~ → Fixed for all ML services
- ~~Whisper & Vector service integration pending~~ → Completed

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

**Last Updated**: 2025-01-05

### ⚠️ MVP Limitation: Global Rate Limiting

The current implementation uses **global platform-wide rate limits**, which works for MVP but has scaling issues:
- With 10k users: First 100 shares process, remaining 9,900 queue behind rate limit
- All users share the same rate limit pool (e.g., 100 TikTok requests/min total)

**Production requirements** (not implemented):
- Per-user rate limiting for fairness
- ~~API key pooling for higher throughput~~ ✅ Implemented for LLM service
- Priority queues based on user tiers

### LLM Service Integration Details (Completed 2025-01-05)

#### Architecture Overview
The LLM service now implements comprehensive rate limiting with the following architecture:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Celery Task   │────▶│ RateLimitedLLM   │────▶│  OpenAI API     │
│   (tasks.py)    │     │     Client       │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ├── Token Counter (tiktoken)
                               ├── API Key Pool
                               ├── Distributed Rate Limiter
                               └── Prometheus Metrics
```

#### Key Components

1. **Token Counter** (`token_counter.py`)
   - Uses tiktoken for accurate OpenAI token counting
   - Model-specific encoding support (cl100k_base, p50k_base, r50k_base)
   - Safety margin feature (1.2x default) to prevent underestimation
   - Supports all OpenAI models including GPT-4o and GPT-4o-mini

2. **Rate Limited Client** (`rate_limited_client.py`)
   - Dual rate limiting: Request (RPM) and Token (TPM) limits
   - API key pooling with health tracking
   - Async/sync bridge for Celery compatibility
   - Automatic retry with different API keys
   - Token deficit tracking for improved accuracy

3. **API Key Pool Management**
   - Multiple API key support (comma-separated in env vars)
   - Round-robin selection with least-recently-used prioritization
   - Health states: ACTIVE, RATE_LIMITED, ERROR, EXHAUSTED
   - Automatic recovery after rate limit timeout
   - Metrics for key rotation tracking

4. **Integration Points**
   - Modified `tasks.py` to use rate limited client when enabled
   - Feature flag: `ENABLE_LLM_RATE_LIMITING` (default: true)
   - Configuration via `/config/rate-limits.yaml`
   - Prometheus metrics exposed on port 9091

#### Configuration Example

```yaml
# /config/rate-limits.yaml
services:
  openai:
    algorithm: token_bucket
    limits:
      - capacity: 500
        refillRate: 8.33  # 500 requests per minute
    costMapping:
      gpt-4o: 5
      gpt-4o-mini: 0.5
      gpt-3.5-turbo: 1
      gpt-4: 10
      
  openai_tokens:
    algorithm: token_bucket
    limits:
      - capacity: 150000
        refillRate: 2500  # 150k tokens per minute
```

#### Testing & Verification

Comprehensive test suite created:
- `test_rate_limiting.py`: Unit tests for all components
- `test_load_rate_limit.py`: Load testing to verify limits
- `test_via_api.py`: End-to-end API testing

Metrics successfully verified:
- Rate limit checks (request + token)
- API key rotations
- Token usage tracking
- Circuit breaker status

#### Environment Variables

```bash
# LLM Service Rate Limiting
ENABLE_LLM_RATE_LIMITING=true  # Feature flag (default: true)
ML_OPENAI_API_KEY=sk-xxx,sk-yyy,sk-zzz  # Comma-separated API keys
OPENAI_API_KEY=sk-xxx  # Fallback if ML_OPENAI_API_KEY not set
REDIS_URL=redis://redis:6379/0  # Redis connection for rate limiter
```

#### Docker Deployment

The configuration file is mounted in `docker-compose.ml.yml`:
```yaml
volumes:
  - ../config:/config:ro  # Makes rate-limits.yaml available
```

### Whisper Service Integration Details (Completed 2025-01-05)

#### Architecture Overview
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Celery Task   │────▶│ RateLimitedWhis- │────▶│  OpenAI Whisper │
│   (tasks.py)    │     │   perClient      │     │      API        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ├── Concurrent Request Limiter
                               ├── Minute-based Rate Limiter
                               ├── API Key Pool
                               └── Queue Depth Monitoring
```

#### Key Features
1. **Concurrent Request Management**
   - Semaphore-based limiting (default: 5 concurrent)
   - Real-time slot availability tracking
   - Prevents API overload

2. **Duration-Based Rate Limiting**
   - Cost calculation per audio minute
   - Integration with token bucket algorithm
   - Minimum 1-minute billing granularity

3. **API Key Pooling**
   - Multiple API key support
   - Health tracking per key
   - Automatic rotation on rate limits

### Vector Service Integration Details (Completed 2025-01-05)

#### Architecture Overview
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Celery Task   │────▶│ RateLimitedEmbe- │────▶│ OpenAI Embed-   │
│   (tasks.py)    │     │  ddingClient     │     │   dings API     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ├── Batch Optimizer
                               ├── Dual Rate Limiter (RPM + TPM)
                               ├── Embedding Cache
                               └── API Key Pool
```

#### Key Features
1. **Intelligent Batch Optimization**
   - Automatic text batching (up to 2048 texts/request)
   - Token-aware batch sizing
   - Minimizes API calls while respecting limits

2. **Dual Rate Limiting**
   - Request-based (RPM) limiting
   - Token-based (TPM) limiting
   - Rollback mechanism for failed checks

3. **Embedding Cache**
   - Redis-backed with 24h TTL
   - SHA256-based cache keys
   - Batch operations for performance

4. **Cost Optimization**
   - Model selection based on content length
   - Batch processing to reduce per-request overhead
   - Cache hits eliminate redundant API calls

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

### Phase 3: ML Service Integration (IN PROGRESS)
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
- [x] **3.2** Integrate with LLM service ✅ COMPLETED (2025-01-05)
  - [x] Add token counting for OpenAI ~~Anthropic~~
    - Created `token_counter.py` using tiktoken library
    - Accurate token counting for all OpenAI models
    - Safety margin (1.2x) for pre-estimation to prevent undercount
  - [x] Implement request/token dual limits
    - Created `rate_limited_client.py` with dual rate limiting
    - Checks both request limit (RPM) and token limit (TPM)
    - Rollback mechanism if token limit fails after request approved
  - [x] Add cost tracking integration
    - Model-specific cost multipliers in rate-limits.yaml
    - Token deficit tracking for continuous accuracy improvement
  - [x] API Key Pooling (MVP Enhancement)
    - Support for multiple OpenAI API keys per worker
    - Round-robin selection with health tracking
    - Automatic key rotation on rate limit errors
    - Key status tracking: ACTIVE, RATE_LIMITED, ERROR, EXHAUSTED
  - [x] Sync/Async Bridge
    - Celery-compatible synchronous wrapper
    - Async implementation for efficient Redis operations
  - [x] Comprehensive error handling
    - Graceful fallback when rate limiting disabled
    - Detailed error messages with retry information
- [x] **3.3** Integrate with Whisper service ✅ COMPLETED (2025-01-05)
  - [x] Add concurrent request limiting
    - Created `rate_limited_client.py` with ConcurrentRequestLimiter
    - Configurable max concurrent requests (default: 5)
    - Semaphore-based slot management
  - [x] Implement file size-based rate limiting
    - Minute-based rate limiting (audio duration)
    - Cost calculation based on duration (minimum 1 minute)
    - Integration with whisper_minutes service config
  - [x] Add queue depth monitoring
    - Real-time queue depth tracking
    - Metrics for concurrent requests and available slots
    - API key health status monitoring
- [x] **3.4** Integrate with Vector service ✅ COMPLETED (2025-01-05)
  - [x] Add batch size optimization
    - Created BatchOptimizer class for intelligent batching
    - Respects OpenAI limits: 2048 texts per request, 8191 tokens per text
    - Dynamic batch sizing based on token counts
  - [x] Implement embedding cache to reduce API calls
    - Redis-based caching with configurable TTL (default: 24h)
    - SHA256 hash-based keys for text+model+dimensions
    - Batch get/set operations for efficiency
  - [ ] Add fallback to local models on rate limit (future enhancement)

### Phase 4: Monitoring & Alerting
- [x] **4.1** Add Prometheus metrics
  - [x] `rate_limit_checks_total{service,result}`
  - [x] `rate_limit_usage_ratio{service}`
  - [x] `rate_limit_backoff_seconds{service}`
  - [x] `api_quota_remaining{service}`
- [x] **4.2** Create Grafana dashboards
  - [x] Rate limit overview dashboard
  - [x] Per-service usage dashboard
  - [x] Cost projection dashboard
- [x] **4.3** Set up alerts
  - [x] Alert on >80% rate limit usage
  - [x] Alert on sustained rate limiting
  - [x] Alert on unexpected 429 errors

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

### Post-Implementation Review (2025-01-06)

After implementing rate limiting across all Python ML services, several critical issues were identified that required immediate fixes:

#### Critical Issues Fixed

1. **Thread Safety Problems**
   - **Issue**: Using `asyncio.new_event_loop()` in sync wrappers caused thread safety issues
   - **Fix**: Replaced with `asyncio.run()` for proper thread-safe execution in all services
   - **Impact**: Prevents crashes under concurrent load

2. **Missing Rollback Method**
   - **Issue**: `vector_service/tasks.py` called non-existent `self.rate_limiter.rollback()`
   - **Fix**: Implemented `rollback()` and `record_usage()` methods in DistributedRateLimiter
   - **Impact**: Prevents crashes when embeddings fail after passing rate limit

3. **Token Deficit Bug**
   - **Issue**: Token deficit was overwritten instead of accumulated (using `=` instead of `+=`)
   - **Fix**: Changed to proper accumulation with `+=`
   - **Impact**: Ensures accurate rate limiting calculations

4. **Encoding Error**
   - **Issue**: GPT-4o models used non-existent 'o200k_base' encoding
   - **Fix**: Updated to use 'cl100k_base' encoding
   - **Impact**: Prevents token counting failures for GPT-4o models

5. **Redis Connection Issues**
   - **Issue**: Socket keepalive options caused "Error 22 connecting to redis:6379. Invalid argument"
   - **Fix**: Removed problematic socket_keepalive_options, using standard timeouts instead
   - **Impact**: Fixes connection failures on various systems

#### Medium Priority Issues Fixed

1. **Resource Management**
   - Added proper cleanup methods and context manager support
   - Prevents resource leaks in long-running services

2. **Configuration Path Flexibility**
   - Made config loader try multiple paths for both Docker and local environments
   - Removed hardcoded `/config/rate-limits.yaml` defaults in Vector and Whisper services
   - Supports development and production deployments seamlessly

3. **Lua Script Type Handling**
   - Fixed decimal cost handling in both Python and Lua scripts
   - Supports fractional rate limiting costs

4. **Shared Redis Connection Pool**
   - Created `redis_manager.py` for shared connection pooling
   - Reduces Redis connections across services
   - Improves resource efficiency

#### Implementation Files Updated

**Core Libraries:**
- `/python/shared/src/bookmarkai_shared/rate_limiter/distributed_rate_limiter.py` - Added rollback/record_usage methods
- `/python/shared/src/bookmarkai_shared/rate_limiter/rate_limit_config.py` - Flexible config path resolution
- `/python/shared/src/bookmarkai_shared/rate_limiter/redis_manager.py` - New shared connection pool
- `/python/shared/src/bookmarkai_shared/rate_limiter/scripts/sliding_window.lua` - Decimal cost support

**Service Updates:**
- `/python/llm-service/src/llm_service/rate_limited_client.py` - Thread safety and token deficit fixes
- `/python/llm-service/src/llm_service/token_counter.py` - Fixed GPT-4o encoding
- `/python/vector-service/src/vector_service/rate_limited_client.py` - Thread safety fixes
- `/python/whisper-service/src/whisper_service/rate_limited_client.py` - Thread safety fixes

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