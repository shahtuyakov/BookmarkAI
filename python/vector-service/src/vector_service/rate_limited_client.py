"""Rate-limited client for OpenAI Embeddings API with batch optimization."""

import os
import asyncio
import logging
from typing import Dict, Any, Optional, List, Tuple
from enum import Enum
from datetime import datetime, timedelta
import time

from openai import OpenAI
import tiktoken
from bookmarkai_shared.distributed_rate_limiter import (
    DistributedRateLimiter,
    RateLimitError,
    RateLimitConfigLoader
)
from bookmarkai_shared.metrics import (
    rate_limit_checks_total,
    rate_limit_wait_time_seconds,
    api_key_rotations_total,
    api_key_health_status,
    track_tokens
)

logger = logging.getLogger(__name__)


class APIKeyStatus(Enum):
    """API key health status."""
    ACTIVE = "active"
    RATE_LIMITED = "rate_limited"
    ERROR = "error"
    EXHAUSTED = "exhausted"


class APIKeyInfo:
    """Track API key health and usage."""
    
    def __init__(self, key: str):
        self.key = key
        self.status = APIKeyStatus.ACTIVE
        self.last_used = None
        self.rate_limit_until = None
        self.error_count = 0
        self.tokens_used = 0
        
    def is_available(self) -> bool:
        """Check if key is available for use."""
        if self.status == APIKeyStatus.ACTIVE:
            return True
        if self.status == APIKeyStatus.RATE_LIMITED and self.rate_limit_until:
            if datetime.utcnow() > self.rate_limit_until:
                self.status = APIKeyStatus.ACTIVE
                self.rate_limit_until = None
                return True
        return False
        
    def mark_rate_limited(self, retry_after_seconds: int = 60):
        """Mark key as rate limited."""
        self.status = APIKeyStatus.RATE_LIMITED
        self.rate_limit_until = datetime.utcnow() + timedelta(seconds=retry_after_seconds)
        logger.warning(f"API key marked as rate limited until {self.rate_limit_until}")
        
    def mark_error(self):
        """Mark key as having an error."""
        self.error_count += 1
        if self.error_count >= 3:
            self.status = APIKeyStatus.ERROR
            logger.error(f"API key marked as error after {self.error_count} failures")


class BatchOptimizer:
    """Optimize embedding batches for cost and performance."""
    
    # OpenAI limits
    MAX_BATCH_SIZE = 2048  # Maximum texts per request
    MAX_TOKENS_PER_REQUEST = 8191  # Maximum tokens per text
    
    def __init__(self, target_batch_size: int = 100):
        """Initialize batch optimizer.
        
        Args:
            target_batch_size: Target number of texts per batch
        """
        self.target_batch_size = min(target_batch_size, self.MAX_BATCH_SIZE)
        self._tokenizer = None
        
    def get_tokenizer(self) -> tiktoken.Encoding:
        """Get tokenizer for embedding models."""
        if self._tokenizer is None:
            self._tokenizer = tiktoken.get_encoding("cl100k_base")
        return self._tokenizer
        
    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return len(self.get_tokenizer().encode(text))
        
    def optimize_batch(self, texts: List[str]) -> List[List[str]]:
        """Optimize texts into batches.
        
        Args:
            texts: List of texts to embed
            
        Returns:
            List of batches, each containing texts
        """
        if not texts:
            return []
            
        # If small enough, return as single batch
        if len(texts) <= self.target_batch_size:
            # Check token limits
            max_tokens = max(self.count_tokens(text) for text in texts)
            if max_tokens <= self.MAX_TOKENS_PER_REQUEST:
                return [texts]
                
        # Otherwise, create batches
        batches = []
        current_batch = []
        current_batch_tokens = 0
        
        for text in texts:
            token_count = self.count_tokens(text)
            
            # Skip texts that are too long
            if token_count > self.MAX_TOKENS_PER_REQUEST:
                logger.warning(f"Text exceeds token limit ({token_count} tokens), skipping")
                continue
                
            # Check if adding this text would exceed batch limits
            if (len(current_batch) >= self.target_batch_size or
                current_batch and current_batch_tokens + token_count > self.MAX_TOKENS_PER_REQUEST * 0.9):
                # Start new batch
                batches.append(current_batch)
                current_batch = [text]
                current_batch_tokens = token_count
            else:
                current_batch.append(text)
                current_batch_tokens += token_count
                
        # Add final batch
        if current_batch:
            batches.append(current_batch)
            
        logger.info(f"Optimized {len(texts)} texts into {len(batches)} batches")
        return batches


class RateLimitedEmbeddingClient:
    """Rate-limited client for OpenAI Embeddings API."""
    
    def __init__(
        self,
        api_keys: Optional[List[str]] = None,
        redis_url: Optional[str] = None,
        config_path: Optional[str] = None,
        enable_rate_limiting: bool = True,
        batch_size: int = 100
    ):
        """Initialize rate-limited embedding client.
        
        Args:
            api_keys: List of OpenAI API keys
            redis_url: Redis connection URL
            config_path: Path to rate limits configuration
            enable_rate_limiting: Whether to enable rate limiting
            batch_size: Target batch size for optimization
        """
        self.enable_rate_limiting = enable_rate_limiting
        
        # Get API keys from environment if not provided
        if not api_keys:
            # Try ML_OPENAI_API_KEY first (can be comma-separated)
            ml_keys = os.getenv('ML_OPENAI_API_KEY', '').strip()
            if ml_keys:
                api_keys = [k.strip() for k in ml_keys.split(',') if k.strip()]
            else:
                # Fallback to single OPENAI_API_KEY
                single_key = os.getenv('OPENAI_API_KEY', '').strip()
                if single_key:
                    api_keys = [single_key]
                    
        if not api_keys:
            raise ValueError("No OpenAI API keys provided")
            
        # Initialize API key pool
        self.api_keys = [APIKeyInfo(key) for key in api_keys]
        self.current_key_index = 0
        logger.info(f"Initialized with {len(self.api_keys)} API keys")
        
        # Initialize batch optimizer
        self.batch_optimizer = BatchOptimizer(target_batch_size=batch_size)
        
        # Initialize rate limiter if enabled
        self.rate_limiter = None
        self.token_limiter = None
        if self.enable_rate_limiting:
            try:
                import redis
                redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
                redis_client = redis.from_url(redis_url, decode_responses=True)
                
                # Load configuration
                config_loader = RateLimitConfigLoader(config_path)
                
                # Request-based rate limiting
                embeddings_config = config_loader.get_config('embeddings')
                if embeddings_config:
                    self.rate_limiter = DistributedRateLimiter(
                        redis_client=redis_client,
                        service_name='embeddings',
                        limits=embeddings_config['limits'],
                        algorithm=embeddings_config['algorithm']
                    )
                    logger.info("Initialized request rate limiter for embeddings")
                    
                # Token-based rate limiting (if configured)
                token_config = config_loader.get_config('embeddings_tokens')
                if token_config:
                    self.token_limiter = DistributedRateLimiter(
                        redis_client=redis_client,
                        service_name='embeddings_tokens',
                        limits=token_config['limits'],
                        algorithm=token_config['algorithm']
                    )
                    logger.info("Initialized token rate limiter for embeddings")
                    
                if not embeddings_config and not token_config:
                    logger.warning("No rate limit config found for embeddings service")
                    self.enable_rate_limiting = False
                    
            except Exception as e:
                logger.error(f"Failed to initialize rate limiter: {e}")
                self.enable_rate_limiting = False
    
    def _get_next_available_key(self) -> Optional[APIKeyInfo]:
        """Get next available API key using round-robin."""
        if not self.api_keys:
            return None
            
        # Try all keys once
        for _ in range(len(self.api_keys)):
            key_info = self.api_keys[self.current_key_index]
            self.current_key_index = (self.current_key_index + 1) % len(self.api_keys)
            
            if key_info.is_available():
                # Track API key health
                api_key_health_status.labels(
                    service='embeddings',
                    status=key_info.status.value
                ).set(1)
                return key_info
                
        logger.warning("No available API keys found")
        return None
    
    async def create_embeddings_with_rate_limit(
        self,
        texts: List[str],
        model: str,
        identifier: str,
        dimensions: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create embeddings with rate limiting and batch optimization.
        
        Args:
            texts: List of texts to embed
            model: Model name to use
            identifier: Unique identifier for rate limiting
            dimensions: Optional dimension reduction
            
        Returns:
            Embeddings response
            
        Raises:
            RateLimitError: If rate limited
            ValueError: If no API keys available
        """
        # Optimize batches
        batches = self.batch_optimizer.optimize_batch(texts)
        if not batches:
            return {'embeddings': [], 'total_tokens': 0}
            
        # Calculate total tokens for rate limiting
        total_tokens = sum(
            self.batch_optimizer.count_tokens(text)
            for batch in batches
            for text in batch
        )
        
        # Check rate limits if enabled
        if self.enable_rate_limiting:
            # Check request limit
            if self.rate_limiter:
                start_wait = time.time()
                # Each batch is one request
                allowed, wait_time = await self.rate_limiter.check_rate_limit(
                    identifier=identifier,
                    cost=len(batches)
                )
                
                # Track rate limit check
                rate_limit_checks_total.labels(
                    service='embeddings',
                    resource='requests',
                    result='allowed' if allowed else 'limited'
                ).inc()
                
                if not allowed:
                    rate_limit_wait_time_seconds.labels(
                        service='embeddings'
                    ).observe(wait_time)
                    raise RateLimitError(
                        f"Request rate limit exceeded. Retry after {wait_time:.1f}s",
                        retry_after_seconds=int(wait_time)
                    )
                    
            # Check token limit
            if self.token_limiter:
                allowed, wait_time = await self.token_limiter.check_rate_limit(
                    identifier=identifier,
                    cost=total_tokens
                )
                
                # Track rate limit check
                rate_limit_checks_total.labels(
                    service='embeddings',
                    resource='tokens',
                    result='allowed' if allowed else 'limited'
                ).inc()
                
                if not allowed:
                    # Roll back request limit if we can't proceed
                    if self.rate_limiter:
                        await self.rate_limiter.rollback(identifier, len(batches))
                    
                    raise RateLimitError(
                        f"Token rate limit exceeded ({total_tokens} tokens). Retry after {wait_time:.1f}s",
                        retry_after_seconds=int(wait_time)
                    )
        
        # Process batches
        all_embeddings = []
        actual_tokens = 0
        last_error = None
        
        for batch_idx, batch in enumerate(batches):
            # Try with available API keys
            success = False
            
            for _ in range(len(self.api_keys)):
                key_info = self._get_next_available_key()
                if not key_info:
                    break
                    
                try:
                    # Create client with selected key
                    client = OpenAI(api_key=key_info.key)
                    
                    # Make API call
                    logger.info(
                        f"Creating embeddings for batch {batch_idx + 1}/{len(batches)} "
                        f"({len(batch)} texts, ~{sum(self.batch_optimizer.count_tokens(t) for t in batch)} tokens)"
                    )
                    
                    # Prepare API parameters
                    api_params = {
                        "model": model,
                        "input": batch
                    }
                    if dimensions:
                        api_params["dimensions"] = dimensions
                        
                    response = client.embeddings.create(**api_params)
                    
                    # Extract embeddings
                    batch_embeddings = [item.embedding for item in response.data]
                    all_embeddings.extend(batch_embeddings)
                    
                    # Track actual tokens used
                    if hasattr(response, 'usage'):
                        batch_tokens = response.usage.total_tokens
                        actual_tokens += batch_tokens
                        key_info.tokens_used += batch_tokens
                    
                    success = True
                    break
                    
                except Exception as e:
                    error_msg = str(e)
                    last_error = e
                    
                    # Check if it's a rate limit error
                    if 'rate_limit' in error_msg.lower() or '429' in error_msg:
                        retry_after = 60  # Default retry after
                        key_info.mark_rate_limited(retry_after)
                        
                        # Track API key rotation
                        api_key_rotations_total.labels(
                            service='embeddings',
                            reason='rate_limit'
                        ).inc()
                        
                        logger.warning(f"API key rate limited, rotating to next key")
                        continue
                        
                    else:
                        # Other error
                        key_info.mark_error()
                        logger.error(f"Embeddings API error: {error_msg}")
                        
            if not success:
                # Failed to process this batch
                if last_error:
                    raise last_error
                else:
                    raise ValueError(f"No available API keys for batch {batch_idx + 1}")
        
        # Update rate limiters with actual usage
        if self.enable_rate_limiting:
            if self.rate_limiter:
                await self.rate_limiter.record_usage(
                    identifier=identifier,
                    cost=len(batches)
                )
            if self.token_limiter and actual_tokens > 0:
                await self.token_limiter.record_usage(
                    identifier=identifier,
                    cost=actual_tokens
                )
                
        # Track token metrics
        track_tokens(actual_tokens or total_tokens, 'embedding', model)
        
        return {
            'embeddings': all_embeddings,
            'total_tokens': actual_tokens or total_tokens,
            'batches_processed': len(batches)
        }
    
    def create_embeddings_sync(
        self,
        texts: List[str],
        model: str,
        identifier: str,
        dimensions: Optional[int] = None
    ) -> Dict[str, Any]:
        """Synchronous wrapper for create_embeddings_with_rate_limit.
        
        For use in Celery tasks which expect synchronous functions.
        """
        # Use asyncio.run() for thread safety
        return asyncio.run(
            self.create_embeddings_with_rate_limit(
                texts,
                model,
                identifier,
                dimensions
            )
        )
    
    def get_batch_optimization_stats(self, texts: List[str]) -> Dict[str, Any]:
        """Get batch optimization statistics for planning."""
        batches = self.batch_optimizer.optimize_batch(texts)
        total_tokens = sum(
            self.batch_optimizer.count_tokens(text)
            for text in texts
        )
        
        return {
            'total_texts': len(texts),
            'total_tokens': total_tokens,
            'num_batches': len(batches),
            'batch_sizes': [len(batch) for batch in batches],
            'avg_tokens_per_text': total_tokens / len(texts) if texts else 0,
            'requests_required': len(batches)
        }