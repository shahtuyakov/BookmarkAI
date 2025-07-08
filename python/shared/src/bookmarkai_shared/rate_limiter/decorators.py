"""
Rate limiter decorators for Python services
"""
import functools
import asyncio
import time
from typing import Optional, Callable, Any
import logging

from .distributed_rate_limiter import DistributedRateLimiter
from .exceptions import RateLimitError

logger = logging.getLogger(__name__)


def rate_limit(
    service: str,
    cost: float = 1.0,
    identifier_func: Optional[Callable] = None,
    raise_on_limit: bool = True
):
    """
    Decorator to apply rate limiting to a function
    
    Args:
        service: Service name for rate limiting (e.g., 'openai', 'whisper')
        cost: Cost of this operation (default 1)
        identifier_func: Function to extract identifier from arguments
        raise_on_limit: If True, raise RateLimitError; if False, wait and retry
    
    Example:
        @rate_limit('openai', cost=10)
        async def call_gpt4(prompt: str):
            # Make API call
            pass
    """
    def decorator(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            # Get rate limiter from somewhere (could be injected via class)
            rate_limiter = getattr(args[0], 'rate_limiter', None) if args else None
            
            if not rate_limiter or not isinstance(rate_limiter, DistributedRateLimiter):
                # No rate limiter available, proceed without limiting
                logger.warning(f"No rate limiter available for {func.__name__}")
                return await func(*args, **kwargs)
            
            # Extract identifier
            identifier = 'default'
            if identifier_func:
                identifier = identifier_func(*args, **kwargs)
            
            # Check rate limit
            try:
                result = await rate_limiter.check_limit(
                    service=service,
                    identifier=identifier,
                    cost=cost
                )
                
                # Proceed with the function
                return await func(*args, **kwargs)
                
            except RateLimitError as e:
                if raise_on_limit:
                    raise
                
                # Wait and retry
                logger.warning(
                    f"Rate limit hit for {service}, waiting {e.retry_after}s before retry"
                )
                await asyncio.sleep(e.retry_after)
                
                # Retry once
                return await func(*args, **kwargs)
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            # For sync functions, we need to run in an event loop
            loop = asyncio.get_event_loop()
            return loop.run_until_complete(async_wrapper(*args, **kwargs))
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


class RateLimitedClient:
    """
    Base class for rate-limited API clients
    """
    
    def __init__(self, service: str, rate_limiter: DistributedRateLimiter):
        self.service = service
        self.rate_limiter = rate_limiter
    
    async def check_rate_limit(self, cost: float = 1.0, identifier: str = 'default'):
        """Check rate limit before making a request"""
        result = await self.rate_limiter.check_limit(
            service=self.service,
            identifier=identifier,
            cost=cost
        )
        
        if not result.allowed:
            raise RateLimitError(
                f"Rate limit exceeded for {self.service}",
                service=self.service,
                retry_after=result.retry_after,
                reset_at=result.reset_at
            )
        
        return result
    
    async def with_rate_limit(
        self,
        func: Callable,
        *args,
        cost: float = 1.0,
        identifier: str = 'default',
        max_retries: int = 3,
        **kwargs
    ) -> Any:
        """
        Execute a function with rate limiting and retries
        
        Args:
            func: Function to execute
            cost: Cost of the operation
            identifier: User/resource identifier
            max_retries: Maximum number of retries on rate limit
            *args, **kwargs: Arguments to pass to func
        
        Returns:
            Result of func
        """
        retries = 0
        
        while retries < max_retries:
            try:
                # Check rate limit
                await self.check_rate_limit(cost=cost, identifier=identifier)
                
                # Execute function
                result = await func(*args, **kwargs)
                
                # Record success
                await self.rate_limiter.record_success(self.service, identifier)
                
                return result
                
            except RateLimitError as e:
                retries += 1
                if retries >= max_retries:
                    raise
                
                # Calculate backoff delay
                delay = await self.rate_limiter.get_backoff_delay(
                    self.service, identifier
                )
                
                logger.warning(
                    f"Rate limit hit for {self.service} (attempt {retries}/{max_retries}), "
                    f"waiting {delay}ms"
                )
                
                await asyncio.sleep(delay / 1000)  # Convert to seconds
        
        raise RateLimitError(
            f"Max retries ({max_retries}) exceeded for {self.service}",
            service=self.service
        )