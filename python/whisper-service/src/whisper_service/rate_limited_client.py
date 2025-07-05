"""Rate-limited client for OpenAI Whisper API with concurrent request management."""

import os
import asyncio
import logging
from typing import Dict, Any, Optional, List
from enum import Enum
from datetime import datetime, timedelta
import time

from openai import OpenAI
from bookmarkai_shared.distributed_rate_limiter import (
    DistributedRateLimiter,
    RateLimitError,
    RateLimitConfigLoader
)
from bookmarkai_shared.metrics import (
    rate_limit_checks_total,
    rate_limit_wait_time_seconds,
    api_key_rotations_total,
    api_key_health_status
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
        self.concurrent_requests = 0
        
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


class ConcurrentRequestLimiter:
    """Manage concurrent request limits."""
    
    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.current_requests = 0
        self._lock = asyncio.Lock()
        
    async def acquire(self) -> bool:
        """Try to acquire a slot for concurrent request."""
        async with self._lock:
            if self.current_requests >= self.max_concurrent:
                return False
            self.current_requests += 1
            return True
            
    async def release(self):
        """Release a concurrent request slot."""
        async with self._lock:
            self.current_requests = max(0, self.current_requests - 1)
            
    @property
    def available_slots(self) -> int:
        """Get number of available slots."""
        return max(0, self.max_concurrent - self.current_requests)


class RateLimitedWhisperClient:
    """Rate-limited client for OpenAI Whisper API."""
    
    def __init__(
        self,
        api_keys: Optional[List[str]] = None,
        redis_url: Optional[str] = None,
        config_path: Optional[str] = None,
        enable_rate_limiting: bool = True,
        max_concurrent_requests: int = 5
    ):
        """Initialize rate-limited Whisper client.
        
        Args:
            api_keys: List of OpenAI API keys
            redis_url: Redis connection URL
            config_path: Path to rate limits configuration
            enable_rate_limiting: Whether to enable rate limiting
            max_concurrent_requests: Maximum concurrent API requests
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
        
        # Initialize concurrent request limiter
        self.concurrent_limiter = ConcurrentRequestLimiter(max_concurrent_requests)
        
        # Initialize rate limiter if enabled
        self.rate_limiter = None
        if self.enable_rate_limiting:
            try:
                import redis
                redis_url = redis_url or os.getenv('REDIS_URL', 'redis://localhost:6379/0')
                redis_client = redis.from_url(redis_url, decode_responses=True)
                
                # Load configuration
                config_loader = RateLimitConfigLoader(config_path)
                service_config = config_loader.get_config('whisper')
                
                if service_config:
                    self.rate_limiter = DistributedRateLimiter(
                        redis_client=redis_client,
                        service_name='whisper',
                        limits=service_config['limits'],
                        algorithm=service_config['algorithm']
                    )
                    logger.info("Initialized distributed rate limiter for Whisper")
                else:
                    logger.warning("No rate limit config found for 'whisper' service")
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
                    service='whisper',
                    status=key_info.status.value
                ).set(1)
                return key_info
                
        logger.warning("No available API keys found")
        return None
    
    async def transcribe_with_rate_limit(
        self,
        audio_file,
        duration_seconds: float,
        identifier: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Transcribe audio with rate limiting and concurrent request management.
        
        Args:
            audio_file: Audio file object or path
            duration_seconds: Duration of audio in seconds
            identifier: Unique identifier for rate limiting
            **kwargs: Additional arguments for OpenAI API
            
        Returns:
            Transcription response
            
        Raises:
            RateLimitError: If rate limited
            ValueError: If no API keys available
        """
        # Check concurrent request limit
        if not await self.concurrent_limiter.acquire():
            available = self.concurrent_limiter.available_slots
            raise RateLimitError(
                f"Concurrent request limit reached. Available slots: {available}",
                retry_after_seconds=5
            )
            
        try:
            # Calculate cost for rate limiting (minutes-based)
            duration_minutes = duration_seconds / 60.0
            cost = max(1, int(duration_minutes))  # Minimum 1 minute for billing
            
            # Check rate limit if enabled
            if self.enable_rate_limiting and self.rate_limiter:
                start_wait = time.time()
                allowed, wait_time = await self.rate_limiter.check_rate_limit(
                    identifier=identifier,
                    cost=cost
                )
                
                # Track rate limit check
                rate_limit_checks_total.labels(
                    service='whisper',
                    resource='minutes',
                    result='allowed' if allowed else 'limited'
                ).inc()
                
                if not allowed:
                    rate_limit_wait_time_seconds.labels(
                        service='whisper'
                    ).observe(wait_time)
                    raise RateLimitError(
                        f"Rate limit exceeded for Whisper. Retry after {wait_time:.1f}s",
                        retry_after_seconds=int(wait_time)
                    )
                    
                # If we had to wait, track it
                actual_wait = time.time() - start_wait
                if actual_wait > 0.1:
                    rate_limit_wait_time_seconds.labels(
                        service='whisper'
                    ).observe(actual_wait)
            
            # Try transcription with available API keys
            last_error = None
            attempts = 0
            
            for _ in range(len(self.api_keys)):
                key_info = self._get_next_available_key()
                if not key_info:
                    break
                    
                attempts += 1
                key_info.concurrent_requests += 1
                
                try:
                    # Create client with selected key
                    client = OpenAI(api_key=key_info.key)
                    
                    # Make API call
                    logger.info(
                        f"Calling Whisper API for {duration_seconds:.1f}s audio "
                        f"(~{duration_minutes:.1f} minutes)"
                    )
                    
                    # Ensure we have the audio file in the right format
                    if hasattr(audio_file, 'read'):
                        # It's already a file object
                        response = client.audio.transcriptions.create(
                            file=audio_file,
                            **kwargs
                        )
                    else:
                        # It's a file path
                        with open(audio_file, 'rb') as f:
                            response = client.audio.transcriptions.create(
                                file=f,
                                **kwargs
                            )
                    
                    # Success - update rate limiter
                    if self.enable_rate_limiting and self.rate_limiter:
                        await self.rate_limiter.record_usage(
                            identifier=identifier,
                            cost=cost
                        )
                    
                    # Update key status
                    key_info.last_used = datetime.utcnow()
                    key_info.error_count = 0  # Reset error count on success
                    
                    return response
                    
                except Exception as e:
                    error_msg = str(e)
                    last_error = e
                    
                    # Check if it's a rate limit error
                    if 'rate_limit' in error_msg.lower() or '429' in error_msg:
                        retry_after = 60  # Default retry after
                        key_info.mark_rate_limited(retry_after)
                        
                        # Track API key rotation
                        api_key_rotations_total.labels(
                            service='whisper',
                            reason='rate_limit'
                        ).inc()
                        
                        logger.warning(f"API key rate limited, rotating to next key")
                        continue
                        
                    else:
                        # Other error
                        key_info.mark_error()
                        logger.error(f"Whisper API error: {error_msg}")
                        
                finally:
                    key_info.concurrent_requests = max(0, key_info.concurrent_requests - 1)
            
            # All attempts failed
            if last_error:
                raise last_error
            else:
                raise ValueError(f"No available API keys after {attempts} attempts")
                
        finally:
            # Always release concurrent request slot
            await self.concurrent_limiter.release()
    
    def transcribe_sync(
        self,
        audio_file,
        duration_seconds: float,
        identifier: str,
        **kwargs
    ) -> Dict[str, Any]:
        """Synchronous wrapper for transcribe_with_rate_limit.
        
        For use in Celery tasks which expect synchronous functions.
        """
        # Use asyncio.run() for thread safety
        return asyncio.run(
            self.transcribe_with_rate_limit(
                audio_file,
                duration_seconds,
                identifier,
                **kwargs
            )
        )
    
    def get_queue_depth(self) -> Dict[str, int]:
        """Get current queue depth metrics."""
        return {
            'concurrent_requests': self.concurrent_limiter.current_requests,
            'available_slots': self.concurrent_limiter.available_slots,
            'max_concurrent': self.concurrent_limiter.max_concurrent,
            'active_keys': sum(1 for k in self.api_keys if k.status == APIKeyStatus.ACTIVE),
            'rate_limited_keys': sum(1 for k in self.api_keys if k.status == APIKeyStatus.RATE_LIMITED)
        }