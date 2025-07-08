"""
Adaptive back-off strategy for rate limiting
Tracks success/failure patterns and adjusts delays dynamically
"""
import asyncio
import time
import math
import logging
from typing import Dict, Optional, List, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from redis.asyncio import Redis
import json

logger = logging.getLogger(__name__)

@dataclass
class BackoffStats:
    """Statistics for adaptive backoff calculation"""
    success_count: int = 0
    failure_count: int = 0
    last_success: Optional[float] = None
    last_failure: Optional[float] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    hourly_success_rate: Dict[int, float] = field(default_factory=dict)
    
    @property
    def success_rate(self) -> float:
        """Calculate overall success rate"""
        total = self.success_count + self.failure_count
        if total == 0:
            return 0.5  # Default to 50% if no history
        return self.success_count / total
    
    @property
    def recent_trend(self) -> str:
        """Determine recent trend: improving, degrading, or stable"""
        if self.consecutive_successes >= 3:
            return "improving"
        elif self.consecutive_failures >= 3:
            return "degrading"
        return "stable"

class AdaptiveBackoffStrategy:
    """
    Implements adaptive back-off based on success/failure patterns
    and time-of-day awareness
    """
    
    def __init__(
        self,
        redis: Redis,
        base_delay_ms: int = 5000,
        min_delay_ms: int = 1000,
        max_delay_ms: int = 60000,
        history_window_seconds: int = 3600,  # 1 hour
        time_of_day_enabled: bool = True,
    ):
        self.redis = redis
        self.base_delay_ms = base_delay_ms
        self.min_delay_ms = min_delay_ms
        self.max_delay_ms = max_delay_ms
        self.history_window_seconds = history_window_seconds
        self.time_of_day_enabled = time_of_day_enabled
        
    async def record_attempt(
        self, 
        service: str, 
        success: bool,
        identifier: str = 'default'
    ) -> None:
        """Record the result of an API attempt"""
        key = f"adaptive_backoff:{service}:{identifier}"
        history_key = f"{key}:history"
        
        now = time.time()
        current_hour = datetime.now().hour
        
        # Add to history (sliding window)
        result = "success" if success else "failure"
        await self.redis.zadd(history_key, {f"{now}:{result}": now})
        
        # Remove old entries
        cutoff = now - self.history_window_seconds
        await self.redis.zremrangebyscore(history_key, '-inf', cutoff)
        
        # Update stats
        stats = await self._get_stats(service, identifier)
        
        if success:
            stats.success_count += 1
            stats.last_success = now
            stats.consecutive_successes += 1
            stats.consecutive_failures = 0
        else:
            stats.failure_count += 1
            stats.last_failure = now
            stats.consecutive_failures += 1
            stats.consecutive_successes = 0
            
        # Update hourly success rate
        hour_key = f"{key}:hour:{current_hour}"
        await self._update_hourly_rate(hour_key, success)
        
        # Save stats
        await self._save_stats(service, identifier, stats)
        
        logger.info(
            f"Recorded {result} for {service}. "
            f"Success rate: {stats.success_rate:.2%}, "
            f"Trend: {stats.recent_trend}"
        )
        
    async def calculate_delay(
        self, 
        service: str,
        identifier: str = 'default',
        attempt_number: int = 1
    ) -> int:
        """Calculate adaptive delay based on patterns"""
        stats = await self._get_stats(service, identifier)
        
        # Base calculation using success rate
        if stats.success_rate > 0.8:
            # High success rate: reduce delay
            multiplier = 0.5
        elif stats.success_rate > 0.5:
            # Moderate success rate: normal delay
            multiplier = 1.0
        elif stats.success_rate > 0.2:
            # Low success rate: increase delay
            multiplier = 2.0
        else:
            # Very low success rate: significant delay
            multiplier = 4.0
            
        # Adjust based on recent trend
        if stats.recent_trend == "improving":
            multiplier *= 0.8  # Reduce delay if improving
        elif stats.recent_trend == "degrading":
            multiplier *= 1.5  # Increase delay if degrading
            
        # Time-of-day adjustment
        if self.time_of_day_enabled:
            tod_multiplier = await self._get_time_of_day_multiplier(
                service, identifier
            )
            multiplier *= tod_multiplier
            
        # Exponential component for consecutive failures
        if stats.consecutive_failures > 0:
            exponential_factor = min(
                2 ** (stats.consecutive_failures - 1),
                8  # Cap at 8x
            )
            multiplier *= exponential_factor
            
        # Calculate final delay
        delay = int(self.base_delay_ms * multiplier)
        
        # Apply bounds
        delay = max(self.min_delay_ms, min(delay, self.max_delay_ms))
        
        logger.info(
            f"Adaptive delay for {service}: {delay}ms "
            f"(multiplier: {multiplier:.2f}, attempt: {attempt_number})"
        )
        
        return delay
        
    async def _get_stats(
        self, 
        service: str, 
        identifier: str
    ) -> BackoffStats:
        """Get current statistics from Redis"""
        key = f"adaptive_backoff:{service}:{identifier}:stats"
        
        data = await self.redis.get(key)
        if not data:
            return BackoffStats()
            
        try:
            stats_dict = json.loads(data)
            return BackoffStats(**stats_dict)
        except Exception as e:
            logger.error(f"Failed to load stats: {e}")
            return BackoffStats()
            
    async def _save_stats(
        self, 
        service: str, 
        identifier: str,
        stats: BackoffStats
    ) -> None:
        """Save statistics to Redis"""
        key = f"adaptive_backoff:{service}:{identifier}:stats"
        
        # Convert to dict, handling None values
        stats_dict = {
            'success_count': stats.success_count,
            'failure_count': stats.failure_count,
            'last_success': stats.last_success,
            'last_failure': stats.last_failure,
            'consecutive_failures': stats.consecutive_failures,
            'consecutive_successes': stats.consecutive_successes,
            'hourly_success_rate': stats.hourly_success_rate,
        }
        
        await self.redis.set(
            key, 
            json.dumps(stats_dict),
            ex=86400  # 24 hour TTL
        )
        
    async def _update_hourly_rate(
        self, 
        hour_key: str, 
        success: bool
    ) -> None:
        """Update hourly success rate"""
        # Use HyperLogLog for efficient counting
        if success:
            await self.redis.hincrby(hour_key, 'success', 1)
        else:
            await self.redis.hincrby(hour_key, 'failure', 1)
            
        await self.redis.expire(hour_key, 86400)  # 24 hour TTL
        
    async def _get_time_of_day_multiplier(
        self, 
        service: str,
        identifier: str
    ) -> float:
        """Get time-of-day adjustment multiplier"""
        current_hour = datetime.now().hour
        
        # Get historical success rates by hour
        hourly_rates = {}
        for hour in range(24):
            hour_key = f"adaptive_backoff:{service}:{identifier}:hour:{hour}"
            data = await self.redis.hgetall(hour_key)
            
            if data:
                success = int(data.get(b'success', 0))
                failure = int(data.get(b'failure', 0))
                total = success + failure
                
                if total > 10:  # Minimum samples
                    hourly_rates[hour] = success / total
                    
        if not hourly_rates:
            return 1.0  # No time-of-day data yet
            
        # Compare current hour to average
        avg_rate = sum(hourly_rates.values()) / len(hourly_rates)
        current_rate = hourly_rates.get(current_hour, avg_rate)
        
        if current_rate > avg_rate * 1.2:
            # This hour typically has better success
            return 0.8
        elif current_rate < avg_rate * 0.8:
            # This hour typically has worse success
            return 1.5
        else:
            return 1.0
            
    async def get_analytics(
        self, 
        service: str,
        identifier: str = 'default'
    ) -> Dict:
        """Get detailed analytics for monitoring"""
        stats = await self._get_stats(service, identifier)
        
        # Get recent history
        history_key = f"adaptive_backoff:{service}:{identifier}:history"
        recent_items = await self.redis.zrevrange(
            history_key, 0, 99, withscores=True
        )
        
        recent_successes = sum(
            1 for item, _ in recent_items 
            if item.decode().endswith(':success')
        )
        recent_failures = len(recent_items) - recent_successes
        
        # Calculate time-based patterns
        hourly_patterns = {}
        if self.time_of_day_enabled:
            for hour in range(24):
                hour_key = f"adaptive_backoff:{service}:{identifier}:hour:{hour}"
                data = await self.redis.hgetall(hour_key)
                
                if data:
                    success = int(data.get(b'success', 0))
                    failure = int(data.get(b'failure', 0))
                    total = success + failure
                    
                    if total > 0:
                        hourly_patterns[hour] = {
                            'success_rate': success / total,
                            'total_attempts': total
                        }
                        
        return {
            'service': service,
            'identifier': identifier,
            'overall_success_rate': stats.success_rate,
            'recent_trend': stats.recent_trend,
            'consecutive_failures': stats.consecutive_failures,
            'consecutive_successes': stats.consecutive_successes,
            'recent_window': {
                'successes': recent_successes,
                'failures': recent_failures,
                'total': len(recent_items),
            },
            'hourly_patterns': hourly_patterns,
            'recommended_delay': await self.calculate_delay(service, identifier),
        }
        
    async def reset_stats(
        self, 
        service: str,
        identifier: str = 'default'
    ) -> None:
        """Reset statistics for a service (useful after configuration changes)"""
        keys = [
            f"adaptive_backoff:{service}:{identifier}:stats",
            f"adaptive_backoff:{service}:{identifier}:history",
        ]
        
        # Add hourly keys
        for hour in range(24):
            keys.append(f"adaptive_backoff:{service}:{identifier}:hour:{hour}")
            
        await self.redis.delete(*keys)
        logger.info(f"Reset adaptive backoff stats for {service}:{identifier}")