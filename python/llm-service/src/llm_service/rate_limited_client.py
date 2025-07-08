"""
Rate-limited LLM client with API key pooling support.
Integrates with the distributed rate limiter from ADR-211.
"""
import os
import asyncio
import logging
import random
from typing import Dict, Any, List, Optional, Tuple
from enum import Enum
import json
import time

from bookmarkai_shared.rate_limiter import (
    DistributedRateLimiter,
    RateLimitConfigLoader,
    get_redis_client
)
from bookmarkai_shared.rate_limiter.exceptions import RateLimitError
from bookmarkai_shared.celery_config import get_redis_url

from .llm_client import LLMClient, LLMProvider
from .token_counter import TokenCounter

logger = logging.getLogger(__name__)

# Import metrics if available
try:
    from bookmarkai_shared.metrics import (
        track_rate_limit_check,
        track_api_key_rotation,
        track_token_estimation_accuracy
    )
    METRICS_ENABLED = True
except ImportError:
    logger.warning("Prometheus metrics not available for rate limiter")
    METRICS_ENABLED = False
    # Create no-op functions
    def track_rate_limit_check(*args, **kwargs): pass
    def track_api_key_rotation(*args, **kwargs): pass
    def track_token_estimation_accuracy(*args, **kwargs): pass


class APIKeyStatus(Enum):
    """Status of an API key."""
    ACTIVE = "active"
    RATE_LIMITED = "rate_limited"
    EXHAUSTED = "exhausted"
    ERROR = "error"


class APIKeyPool:
    """
    Manages multiple OpenAI API keys with health tracking.
    """
    
    def __init__(self, api_keys: List[str]):
        """
        Initialize API key pool.
        
        Args:
            api_keys: List of OpenAI API keys
        """
        if not api_keys:
            raise ValueError("At least one API key must be provided")
        
        self.keys = api_keys
        self.key_status = {key: APIKeyStatus.ACTIVE for key in api_keys}
        self.key_last_used = {key: 0 for key in api_keys}
        self.key_error_count = {key: 0 for key in api_keys}
        self.key_rate_limited_until = {key: 0 for key in api_keys}
    
    def get_next_key(self) -> Optional[str]:
        """
        Get the next available API key using round-robin with health checks.
        
        Returns:
            API key or None if all keys are unavailable
        """
        current_time = time.time()
        active_keys = []
        
        # Find all active keys
        for key in self.keys:
            # Check if rate limit has expired
            if self.key_status[key] == APIKeyStatus.RATE_LIMITED:
                if current_time > self.key_rate_limited_until[key]:
                    self.key_status[key] = APIKeyStatus.ACTIVE
                    self.key_error_count[key] = 0
                    logger.info(f"API key {key[-6:]}... recovered from rate limit")
            
            if self.key_status[key] == APIKeyStatus.ACTIVE:
                active_keys.append(key)
        
        if not active_keys:
            logger.warning("No active API keys available")
            return None
        
        # Select least recently used active key
        active_keys.sort(key=lambda k: self.key_last_used[k])
        selected_key = active_keys[0]
        self.key_last_used[selected_key] = current_time
        
        # Track API key rotation metric
        if METRICS_ENABLED:
            track_api_key_rotation('openai', 'success')
        
        return selected_key
    
    def mark_key_rate_limited(self, key: str, retry_after: int = 60):
        """Mark a key as rate limited."""
        self.key_status[key] = APIKeyStatus.RATE_LIMITED
        self.key_rate_limited_until[key] = time.time() + retry_after
        self.key_error_count[key] += 1
        logger.warning(
            f"API key {key[-6:]}... marked as rate limited for {retry_after}s"
        )
    
    def mark_key_error(self, key: str):
        """Mark a key as having an error."""
        self.key_error_count[key] += 1
        if self.key_error_count[key] >= 5:
            self.key_status[key] = APIKeyStatus.ERROR
            logger.error(f"API key {key[-6:]}... disabled due to repeated errors")
    
    def mark_key_success(self, key: str):
        """Mark a successful use of a key."""
        self.key_error_count[key] = 0
        if self.key_status[key] != APIKeyStatus.EXHAUSTED:
            self.key_status[key] = APIKeyStatus.ACTIVE
    
    def get_pool_status(self) -> Dict[str, Any]:
        """Get status of all keys in the pool."""
        return {
            'total_keys': len(self.keys),
            'active_keys': sum(1 for s in self.key_status.values() if s == APIKeyStatus.ACTIVE),
            'rate_limited_keys': sum(1 for s in self.key_status.values() if s == APIKeyStatus.RATE_LIMITED),
            'error_keys': sum(1 for s in self.key_status.values() if s == APIKeyStatus.ERROR),
            'exhausted_keys': sum(1 for s in self.key_status.values() if s == APIKeyStatus.EXHAUSTED),
        }


class RateLimitedLLMClient:
    """
    Rate-limited wrapper for LLM client with API key pooling.
    Implements dual rate limiting (requests + tokens) with pre-estimation.
    """
    
    def __init__(
        self,
        provider: LLMProvider = LLMProvider.OPENAI,
        api_keys: Optional[List[str]] = None,
        redis_url: Optional[str] = None,
        config_path: str = '/config/rate-limits.yaml',
        enable_rate_limiting: bool = True
    ):
        """
        Initialize rate-limited LLM client.
        
        Args:
            provider: LLM provider (only OpenAI supported)
            api_keys: List of API keys for pooling
            redis_url: Redis URL for rate limiter
            config_path: Path to rate limits configuration
            enable_rate_limiting: Feature flag for rate limiting
        """
        if provider != LLMProvider.OPENAI:
            raise ValueError("Only OpenAI provider is supported")
        
        self.provider = provider
        self.enable_rate_limiting = enable_rate_limiting
        
        # Initialize API key pool
        if api_keys:
            self.api_keys = api_keys
        else:
            # Get from environment - support multiple keys
            # Check both OPENAI_API_KEY and ML_OPENAI_API_KEY
            api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('ML_OPENAI_API_KEY')
            if not api_key:
                raise ValueError("OPENAI_API_KEY or ML_OPENAI_API_KEY environment variable not set")
            
            # Support comma-separated keys
            self.api_keys = [k.strip() for k in api_key.split(',') if k.strip()]
        
        self.key_pool = APIKeyPool(self.api_keys)
        
        # Initialize components
        self.token_counter = TokenCounter()
        self._llm_clients = {}  # Cache clients per API key
        
        # Initialize rate limiter if enabled
        if self.enable_rate_limiting:
            redis_url = redis_url or get_redis_url()
            # Use shared Redis client
            self.redis_client = get_redis_client(redis_url)
            # Create config loader
            config_loader = RateLimitConfigLoader(config_path=config_path)
            # Initialize rate limiter with Redis client
            self.rate_limiter = DistributedRateLimiter(
                redis_client=self.redis_client,
                config_loader=config_loader
            )
            logger.info(f"Rate limiting enabled with {len(self.api_keys)} API keys")
        else:
            self.rate_limiter = None
            self.redis_client = None
            logger.info("Rate limiting disabled")
        
        # Token deficit tracking (when actual > estimated)
        self.token_deficit = 0
    
    def _get_llm_client(self, api_key: str) -> LLMClient:
        """Get or create LLM client for a specific API key."""
        if api_key not in self._llm_clients:
            # Temporarily set the API key
            original_key = os.environ.get('OPENAI_API_KEY')
            os.environ['OPENAI_API_KEY'] = api_key
            
            try:
                self._llm_clients[api_key] = LLMClient(provider=self.provider)
            finally:
                # Restore original key
                if original_key:
                    os.environ['OPENAI_API_KEY'] = original_key
                else:
                    os.environ.pop('OPENAI_API_KEY', None)
        
        return self._llm_clients[api_key]
    
    async def generate_summary_with_rate_limit(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 500,
        identifier: str = 'default'
    ) -> Dict[str, Any]:
        """
        Generate summary with rate limiting and API key pooling.
        
        Args:
            prompt: The prompt to send to the LLM
            model: Model name (e.g., 'gpt-3.5-turbo')
            max_tokens: Maximum tokens in response
            identifier: User/resource identifier for rate limiting
            
        Returns:
            Summary result with token usage
        """
        model = model or "gpt-3.5-turbo"
        max_retries = len(self.api_keys) * 2  # Try each key twice
        
        for attempt in range(max_retries):
            # Get next available API key
            api_key = self.key_pool.get_next_key()
            if not api_key:
                # All keys exhausted
                pool_status = self.key_pool.get_pool_status()
                raise RateLimitError(
                    f"All API keys exhausted: {pool_status}",
                    service='openai',
                    retry_after=60
                )
            
            try:
                # Perform rate-limited call
                result = await self._rate_limited_call(
                    api_key=api_key,
                    prompt=prompt,
                    model=model,
                    max_tokens=max_tokens,
                    identifier=identifier
                )
                
                # Mark success
                self.key_pool.mark_key_success(api_key)
                return result
                
            except RateLimitError as e:
                # Mark key as rate limited
                retry_after = getattr(e, 'retry_after', 60)
                self.key_pool.mark_key_rate_limited(api_key, retry_after)
                
                if attempt < max_retries - 1:
                    # Try next key
                    logger.warning(f"Rate limit hit on key {api_key[-6:]}..., trying next key")
                    continue
                else:
                    # All attempts exhausted
                    raise
                    
            except Exception as e:
                # Mark key as having an error
                self.key_pool.mark_key_error(api_key)
                
                if attempt < max_retries - 1 and "rate_limit" not in str(e).lower():
                    # Try next key for non-rate-limit errors
                    logger.error(f"Error with key {api_key[-6:]}...: {e}, trying next key")
                    continue
                else:
                    raise
    
    async def _rate_limited_call(
        self,
        api_key: str,
        prompt: str,
        model: str,
        max_tokens: int,
        identifier: str
    ) -> Dict[str, Any]:
        """
        Make a rate-limited call to OpenAI.
        
        Args:
            api_key: API key to use
            prompt: The prompt
            model: Model name
            max_tokens: Max response tokens
            identifier: Rate limit identifier
            
        Returns:
            API response
        """
        # Step 1: Estimate tokens
        estimated_input_tokens = self.token_counter.estimate_tokens_with_safety_margin(
            prompt, model, safety_factor=1.2
        )
        
        # Add any deficit from previous calls
        estimated_total_tokens = estimated_input_tokens + max_tokens + self.token_deficit
        
        # Step 2: Check rate limits (if enabled)
        if self.enable_rate_limiting and self.rate_limiter:
            await self._check_dual_limits(model, estimated_total_tokens, identifier)
            
            # Track successful rate limit check
            if METRICS_ENABLED:
                track_rate_limit_check('openai', model, 'allowed')
        
        # Step 3: Make API call (sync to async)
        result = await self._sync_to_async_call(
            api_key=api_key,
            prompt=prompt,
            model=model,
            max_tokens=max_tokens
        )
        
        # Step 4: Adjust rate limiter with actual tokens
        if self.enable_rate_limiting and self.rate_limiter:
            await self._adjust_token_usage(
                model=model,
                estimated_tokens=estimated_total_tokens,
                actual_tokens=result['tokens_used']['total'],
                identifier=identifier
            )
        
        return result
    
    async def _check_dual_limits(
        self,
        model: str,
        estimated_tokens: int,
        identifier: str
    ):
        """
        Check both request and token rate limits.
        
        Args:
            model: Model name for cost mapping
            estimated_tokens: Estimated total tokens
            identifier: Rate limit identifier
        """
        # Check request limit (cost = 1)
        request_result = await self.rate_limiter.check_limit(
            service='openai',
            identifier=identifier,
            cost=1.0
        )
        
        if not request_result.allowed:
            if METRICS_ENABLED:
                track_rate_limit_check('openai', model, 'request_limited')
            raise RateLimitError(
                "Request rate limit exceeded",
                service='openai',
                retry_after=request_result.retry_after
            )
        
        # Check token limit using cost mapping
        # Get cost multiplier from config
        cost_multiplier = await self._get_model_cost_multiplier(model)
        token_cost = estimated_tokens * cost_multiplier
        
        token_result = await self.rate_limiter.check_limit(
            service='openai_tokens',  # Separate limiter for tokens
            identifier=identifier,
            cost=token_cost
        )
        
        if not token_result.allowed:
            # Roll back the request limit
            await self.rate_limiter.record_usage(
                service='openai',
                identifier=identifier,
                cost=-1.0  # Negative cost to rollback
            )
            
            raise RateLimitError(
                f"Token rate limit exceeded (estimated {estimated_tokens} tokens)",
                service='openai',
                retry_after=token_result.retry_after
            )
    
    async def _get_model_cost_multiplier(self, model: str) -> float:
        """Get cost multiplier for a model from config."""
        # Default cost mappings
        default_costs = {
            'gpt-4': 10,
            'gpt-4-turbo': 10,
            'gpt-3.5-turbo': 1,
            'gpt-4o': 5,
            'gpt-4o-mini': 0.5,
        }
        
        # Get from config if available
        if self.rate_limiter and hasattr(self.rate_limiter, 'config_loader'):
            config = self.rate_limiter.config_loader.get_config('openai')
            if config and hasattr(config, 'cost_mapping') and config.cost_mapping:
                return config.cost_mapping.get(model, 1.0)
        
        return default_costs.get(model, 1.0)
    
    async def _sync_to_async_call(
        self,
        api_key: str,
        prompt: str,
        model: str,
        max_tokens: int
    ) -> Dict[str, Any]:
        """
        Bridge sync OpenAI client to async context.
        
        Args:
            api_key: API key to use
            prompt: The prompt
            model: Model name
            max_tokens: Max response tokens
            
        Returns:
            API response
        """
        # Get client for this API key
        client = self._get_llm_client(api_key)
        
        # Run sync call in thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: client.generate_summary(
                prompt=prompt,
                model=model,
                max_tokens=max_tokens
            )
        )
        
        return result
    
    async def _adjust_token_usage(
        self,
        model: str,
        estimated_tokens: int,
        actual_tokens: int,
        identifier: str
    ):
        """
        Adjust rate limiter based on actual token usage.
        
        Args:
            model: Model name
            estimated_tokens: What we estimated
            actual_tokens: What was actually used
            identifier: Rate limit identifier
        """
        # Calculate the difference
        token_difference = actual_tokens - estimated_tokens
        
        if token_difference > 0:
            # We underestimated - track deficit
            self.token_deficit += token_difference
            logger.warning(
                f"Token underestimate for {model}: "
                f"estimated {estimated_tokens}, actual {actual_tokens}, "
                f"deficit {token_difference}"
            )
            
            # Track estimation accuracy metric
            if METRICS_ENABLED:
                accuracy = (estimated_tokens / actual_tokens) * 100
                track_token_estimation_accuracy('openai', model, accuracy)
            
            # Record the additional tokens used
            cost_multiplier = await self._get_model_cost_multiplier(model)
            await self.rate_limiter.record_usage(
                service='openai_tokens',
                identifier=identifier,
                cost=token_difference * cost_multiplier
            )
        else:
            # We overestimated - that's okay, better safe than sorry
            self.token_deficit = max(0, self.token_deficit - abs(token_difference))
            logger.debug(
                f"Token overestimate for {model}: "
                f"estimated {estimated_tokens}, actual {actual_tokens}"
            )
    
    def generate_summary(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """
        Synchronous wrapper for Celery compatibility.
        
        Args:
            prompt: The prompt
            model: Model name
            max_tokens: Max response tokens
            
        Returns:
            Summary result
        """
        # Use asyncio.run() for thread safety
        return asyncio.run(
            self.generate_summary_with_rate_limit(
                prompt=prompt,
                model=model,
                max_tokens=max_tokens,
                identifier='default'  # Global rate limiting for MVP
            )
        )
    
    async def get_status(self) -> Dict[str, Any]:
        """Get client status including pool and rate limit info."""
        status = {
            'provider': self.provider.value,
            'rate_limiting_enabled': self.enable_rate_limiting,
            'api_key_pool': self.key_pool.get_pool_status(),
            'token_deficit': self.token_deficit
        }
        
        if self.enable_rate_limiting and self.rate_limiter:
            # Get rate limit configuration
            status['rate_limits'] = {
                'config_loaded': hasattr(self.rate_limiter, 'config_loader'),
                'redis_connected': self.redis_client is not None
            }
        
        return status
    
    async def close(self):
        """Clean up resources."""
        if self.rate_limiter:
            await self.rate_limiter.close()
        if self.redis_client:
            await self.redis_client.close()
    
    async def __aenter__(self):
        """Context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        await self.close()