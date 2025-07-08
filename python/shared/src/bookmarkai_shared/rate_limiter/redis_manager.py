"""
Shared Redis connection manager for rate limiting.
Ensures consistent connection pooling across all services.
"""
import os
import logging
from typing import Optional
import redis.asyncio as redis
from redis.asyncio.connection import ConnectionPool

logger = logging.getLogger(__name__)

# Global connection pool instance
_connection_pool: Optional[ConnectionPool] = None


def get_redis_connection_pool(redis_url: Optional[str] = None) -> ConnectionPool:
    """
    Get or create a shared Redis connection pool.
    
    This ensures all services share the same connection pool,
    reducing the number of connections to Redis.
    
    Args:
        redis_url: Redis URL (uses environment or default if not provided)
        
    Returns:
        Shared ConnectionPool instance
    """
    global _connection_pool
    
    if _connection_pool is None:
        # Get Redis URL
        if not redis_url:
            redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
        
        # Create connection pool with sensible defaults
        # Note: socket_keepalive_options can cause issues on some systems
        _connection_pool = redis.ConnectionPool.from_url(
            redis_url,
            decode_responses=True,
            max_connections=50,  # Reasonable limit for all services
            socket_keepalive=True,
            socket_connect_timeout=5,
            socket_timeout=5
        )
        logger.info(f"Created shared Redis connection pool: {redis_url}")
    
    return _connection_pool


def get_redis_client(redis_url: Optional[str] = None) -> redis.Redis:
    """
    Get a Redis client using the shared connection pool.
    
    Args:
        redis_url: Redis URL (uses environment or default if not provided)
        
    Returns:
        Redis client instance
    """
    pool = get_redis_connection_pool(redis_url)
    return redis.Redis(connection_pool=pool)


async def close_redis_pool():
    """Close the shared Redis connection pool."""
    global _connection_pool
    
    if _connection_pool:
        await _connection_pool.disconnect()
        _connection_pool = None
        logger.info("Closed shared Redis connection pool")