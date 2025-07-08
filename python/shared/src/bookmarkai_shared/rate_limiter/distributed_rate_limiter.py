"""
Distributed Rate Limiter implementation using Redis
Compatible with the Node.js implementation for cross-service rate limiting
"""
import os
import time
import random
import logging
import asyncio
from typing import Optional, Dict, Any, Tuple
from redis.asyncio import Redis
from redis.exceptions import RedisError, ConnectionError

from .rate_limit_config import RateLimitConfig, RateLimitConfigLoader, Algorithm
from .exceptions import RateLimitError, RateLimiterUnavailableError
from .metrics import MetricsCollector
from .adaptive_backoff import AdaptiveBackoffStrategy

logger = logging.getLogger(__name__)


class RateLimitResult:
    """Result of a rate limit check"""
    
    def __init__(self, allowed: bool, remaining: int, limit: int, retry_after: int = 0):
        self.allowed = allowed
        self.remaining = remaining
        self.limit = limit
        self.retry_after = retry_after  # seconds
        self.reset_at = int(time.time()) + retry_after if retry_after > 0 else 0


class DistributedRateLimiter:
    """
    Distributed rate limiter using Redis
    Supports both sliding window and token bucket algorithms
    """
    
    def __init__(self, redis_client: Redis, config_loader: Optional[RateLimitConfigLoader] = None, enable_adaptive_backoff: bool = True):
        self.redis = redis_client
        self.config_loader = config_loader or RateLimitConfigLoader()
        self._scripts = {}
        self._circuit_breaker_open = False
        self._circuit_breaker_reset_time = 0
        self._load_lua_scripts()
        
        # Initialize adaptive backoff
        self.enable_adaptive_backoff = enable_adaptive_backoff
        if enable_adaptive_backoff:
            self.adaptive_backoff = AdaptiveBackoffStrategy(
                redis=redis_client,
                base_delay_ms=5000,
                min_delay_ms=1000,
                max_delay_ms=60000,
                time_of_day_enabled=True
            )
    
    def _load_lua_scripts(self):
        """Load Lua scripts from files"""
        script_dir = os.path.join(os.path.dirname(__file__), 'scripts')
        
        # Load sliding window script
        with open(os.path.join(script_dir, 'sliding_window.lua'), 'r') as f:
            self._scripts['sliding_window'] = f.read()
        
        # Load token bucket script
        with open(os.path.join(script_dir, 'token_bucket.lua'), 'r') as f:
            self._scripts['token_bucket'] = f.read()
    
    async def check_limit(
        self,
        service: str,
        identifier: str = 'default',
        cost: float = 1.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> RateLimitResult:
        """
        Check if a request is allowed under the rate limit
        
        Args:
            service: Service name (e.g., 'openai', 'reddit')
            identifier: Unique identifier (e.g., user ID)
            cost: Cost of this request (for token bucket)
            metadata: Additional metadata for logging
        
        Returns:
            RateLimitResult with allowed status and details
        
        Raises:
            RateLimitError: If rate limit is exceeded
            RateLimiterUnavailableError: If Redis is unavailable
        """
        # Check circuit breaker
        if self._is_circuit_breaker_open():
            raise RateLimiterUnavailableError("Rate limiter circuit breaker is open")
        
        try:
            config = self.config_loader.get_config(service)
            if not config:
                logger.warning(f"No rate limit config for service: {service}")
                return RateLimitResult(allowed=True, remaining=999, limit=999)
            
            # For services with multiple limits, check all of them
            result = None
            with MetricsCollector.time_redis_operation('check_limit'):
                for limit_config in config.limits:
                    result = await self._check_single_limit(
                        service, identifier, config, limit_config, cost
                    )
                    
                    if not result.allowed:
                        MetricsCollector.record_check(service, allowed=False)
                        MetricsCollector.record_usage(
                            service, 
                            result.limit - result.remaining, 
                            result.limit
                        )
                        raise RateLimitError(
                            f"Rate limit exceeded for {service}",
                            service=service,
                            retry_after=result.retry_after,
                            reset_at=result.reset_at
                        )
            
            # All limits passed
            MetricsCollector.record_check(service, allowed=True)
            if result:
                MetricsCollector.record_usage(
                    service, 
                    result.limit - result.remaining, 
                    result.limit
                )
            return result
            
        except (RedisError, ConnectionError) as e:
            logger.error(f"Redis error in rate limiter: {e}")
            MetricsCollector.record_check(service, allowed=False, error=True)
            self._open_circuit_breaker()
            raise RateLimiterUnavailableError(f"Redis unavailable: {e}")
    
    async def _check_single_limit(
        self,
        service: str,
        identifier: str,
        config: RateLimitConfig,
        limit_config: Any,
        cost: float
    ) -> RateLimitResult:
        """Check a single rate limit"""
        if config.algorithm == Algorithm.SLIDING_WINDOW:
            return await self._check_sliding_window(
                service, identifier, limit_config, cost, config.ttl
            )
        else:  # TOKEN_BUCKET
            return await self._check_token_bucket(
                service, identifier, limit_config, cost, config
            )
    
    async def _check_sliding_window(
        self,
        service: str,
        identifier: str,
        limit_config: Any,
        cost: float,
        ttl: int
    ) -> RateLimitResult:
        """Check rate limit using sliding window algorithm"""
        key = f"rl:sw:{service}:{identifier}"
        now = int(time.time() * 1000)  # milliseconds
        
        # Execute Lua script
        result = await self.redis.eval(
            self._scripts['sliding_window'],
            1,  # number of keys
            key,  # KEYS[1]
            now,  # ARGV[1] - current timestamp
            limit_config.window,  # ARGV[2] - window size in seconds
            limit_config.requests,  # ARGV[3] - request limit
            identifier,  # ARGV[4] - identifier
            cost  # ARGV[5] - cost (preserve decimal)
        )
        
        allowed = bool(result[0])
        current_count = int(result[1])
        limit = int(result[2])
        retry_after = int(result[3])
        
        remaining = max(0, limit - current_count) if allowed else 0
        
        return RateLimitResult(
            allowed=allowed,
            remaining=remaining,
            limit=limit,
            retry_after=retry_after
        )
    
    async def _check_token_bucket(
        self,
        service: str,
        identifier: str,
        limit_config: Any,
        cost: float,
        config: RateLimitConfig
    ) -> RateLimitResult:
        """Check rate limit using token bucket algorithm"""
        tokens_key = f"rl:tb:{service}:{identifier}:tokens"
        last_refill_key = f"rl:tb:{service}:{identifier}:last"
        now = int(time.time() * 1000)  # milliseconds
        
        # Map cost if cost mapping exists
        if config.cost_mapping and hasattr(limit_config, 'cost_mapping'):
            # This would need the specific operation/model info
            # For now, use the provided cost
            pass
        
        # Execute Lua script
        result = await self.redis.eval(
            self._scripts['token_bucket'],
            2,  # number of keys
            tokens_key,  # KEYS[1]
            last_refill_key,  # KEYS[2]
            now,  # ARGV[1] - current timestamp
            limit_config.capacity,  # ARGV[2] - bucket capacity
            limit_config.refill_rate,  # ARGV[3] - refill rate per second
            cost,  # ARGV[4] - requested tokens
            config.ttl  # ARGV[5] - TTL in seconds
        )
        
        allowed = bool(result[0])
        remaining_tokens = int(result[1])
        capacity = int(result[2])
        retry_after = int(result[3])
        
        return RateLimitResult(
            allowed=allowed,
            remaining=remaining_tokens,
            limit=capacity,
            retry_after=retry_after
        )
    
    async def get_backoff_delay(self, service: str, identifier: str = 'default') -> int:
        """
        Calculate backoff delay for a service
        
        Returns:
            Delay in milliseconds
        """
        config = self.config_loader.get_config(service)
        if not config:
            return 1000  # Default 1 second
        
        backoff = config.backoff
        
        # Get current attempt count (simplified - in production, track this properly)
        attempt_key = f"rl:attempts:{service}:{identifier}"
        attempts = int(await self.redis.incr(attempt_key) or 1)
        await self.redis.expire(attempt_key, 3600)  # Reset after 1 hour
        
        # Calculate delay based on backoff type
        if backoff.type.value == 'exponential':
            delay = min(
                backoff.initial_delay * (backoff.multiplier ** (attempts - 1)),
                backoff.max_delay
            )
        elif backoff.type.value == 'linear':
            delay = min(
                backoff.initial_delay * attempts,
                backoff.max_delay
            )
        else:  # adaptive
            # Use the adaptive backoff strategy if enabled
            if self.enable_adaptive_backoff and backoff.type.value == 'adaptive':
                delay = await self.adaptive_backoff.calculate_delay(
                    service=service,
                    identifier=identifier,
                    attempt_number=attempts
                )
            else:
                # Fallback to simple adaptive
                delay = min(
                    backoff.initial_delay * (1.5 ** (attempts - 1)),
                    backoff.max_delay
                )
        
        # Add jitter if enabled
        if backoff.jitter:
            jitter = random.uniform(0, delay * 0.1)  # Up to 10% jitter
            delay += jitter
        
        final_delay = int(delay)
        MetricsCollector.record_backoff(service, final_delay)
        return final_delay
    
    async def record_success(self, service: str, identifier: str = 'default'):
        """Record a successful request (for adaptive backoff)"""
        attempt_key = f"rl:attempts:{service}:{identifier}"
        await self.redis.delete(attempt_key)
        
        # Record success for adaptive backoff
        if self.enable_adaptive_backoff:
            await self.adaptive_backoff.record_attempt(
                service=service,
                success=True,
                identifier=identifier
            )
    
    async def record_failure(self, service: str, identifier: str = 'default'):
        """Record a failed request (for adaptive backoff)"""
        # Record failure for adaptive backoff
        if self.enable_adaptive_backoff:
            await self.adaptive_backoff.record_attempt(
                service=service,
                success=False,
                identifier=identifier
            )
    
    async def update_from_headers(
        self,
        service: str,
        headers: Dict[str, Any],
        identifier: str = 'default'
    ):
        """
        Update rate limit state based on API response headers
        This helps keep our limits in sync with the actual API state
        """
        # Parse rate limit headers
        limit = None
        remaining = None
        reset = None
        
        # Standard headers
        if 'x-ratelimit-limit' in headers:
            limit = int(headers['x-ratelimit-limit'])
        if 'x-ratelimit-remaining' in headers:
            remaining = int(headers['x-ratelimit-remaining'])
        if 'x-ratelimit-reset' in headers:
            reset = int(headers['x-ratelimit-reset'])
        
        # Service-specific headers
        if service == 'openai':
            if 'x-ratelimit-limit-requests' in headers:
                limit = int(headers['x-ratelimit-limit-requests'])
            if 'x-ratelimit-remaining-requests' in headers:
                remaining = int(headers['x-ratelimit-remaining-requests'])
        
        # Log the information (in production, could update Redis state)
        if limit or remaining or reset:
            logger.debug(
                f"Rate limit info from {service} API: "
                f"limit={limit}, remaining={remaining}, reset={reset}"
            )
    
    def _is_circuit_breaker_open(self) -> bool:
        """Check if circuit breaker is open"""
        if self._circuit_breaker_open:
            if time.time() >= self._circuit_breaker_reset_time:
                self._circuit_breaker_open = False
                MetricsCollector.set_circuit_breaker(False)
                logger.info("Rate limiter circuit breaker closed")
            else:
                return True
        return False
    
    def _open_circuit_breaker(self):
        """Open circuit breaker for 30 seconds"""
        self._circuit_breaker_open = True
        self._circuit_breaker_reset_time = time.time() + 30
        MetricsCollector.set_circuit_breaker(True)
        logger.warning("Rate limiter circuit breaker opened for 30 seconds")
    
    async def record_usage(
        self,
        service: str,
        identifier: str = 'default',
        cost: float = 1.0
    ):
        """
        Record usage without checking the limit.
        Used for adjusting rate limits after the fact (e.g., negative cost for rollback).
        
        Args:
            service: Service name
            identifier: Unique identifier
            cost: Cost to record (can be negative for rollback)
        """
        try:
            config = self.config_loader.get_config(service)
            if not config:
                return
            
            if config.algorithm == Algorithm.SLIDING_WINDOW:
                # For sliding window, add/remove entries
                key = f"rl:sw:{service}:{identifier}"
                now = int(time.time() * 1000)
                
                if cost > 0:
                    # Add entries
                    await self.redis.zadd(key, {f"{identifier}:{now}": now})
                else:
                    # Remove entries (rollback)
                    # Remove the most recent entries
                    entries = await self.redis.zrevrange(key, 0, int(abs(cost)) - 1)
                    if entries:
                        await self.redis.zrem(key, *entries)
                        
            else:  # TOKEN_BUCKET
                # For token bucket, adjust token count
                tokens_key = f"rl:tb:{service}:{identifier}:tokens"
                await self.redis.incrbyfloat(tokens_key, -cost)  # Negative to consume, positive to refund
                
        except Exception as e:
            logger.error(f"Error recording usage for {service}: {e}")
    
    async def rollback(
        self,
        service: str,
        identifier: str = 'default',
        cost: float = 1.0
    ):
        """
        Rollback a previous rate limit consumption.
        This is useful when a rate limit was consumed but the operation failed.
        
        Args:
            service: Service name
            identifier: Unique identifier  
            cost: Cost to rollback (will be negated)
        """
        await self.record_usage(service, identifier, -abs(cost))
    
    async def close(self):
        """Close Redis connections and clean up resources."""
        try:
            await self.redis.close()
            logger.info("Rate limiter Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")