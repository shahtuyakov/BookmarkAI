"""Simple embedding cache to reduce redundant API calls."""

import os
import json
import hashlib
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import redis
from redis.exceptions import RedisError

logger = logging.getLogger(__name__)


class EmbeddingCache:
    """Redis-based cache for embeddings to reduce API calls."""
    
    def __init__(self, redis_client: Optional[redis.Redis] = None, ttl_hours: int = 24):
        """Initialize embedding cache.
        
        Args:
            redis_client: Redis client instance
            ttl_hours: Time to live for cache entries in hours
        """
        self.redis_client = redis_client
        self.ttl = timedelta(hours=ttl_hours)
        self.enabled = redis_client is not None
        
        if not self.enabled:
            logger.warning("Embedding cache disabled - no Redis client provided")
        else:
            logger.info(f"Embedding cache initialized with {ttl_hours}h TTL")
    
    def _generate_key(self, text: str, model: str, dimensions: Optional[int] = None) -> str:
        """Generate cache key for text + model combination."""
        # Create hash of text content
        text_hash = hashlib.sha256(text.encode('utf-8')).hexdigest()[:16]
        
        # Include model and dimensions in key
        key_parts = ['embed_cache', model, str(dimensions or 'default'), text_hash]
        return ':'.join(key_parts)
    
    def get(self, text: str, model: str, dimensions: Optional[int] = None) -> Optional[List[float]]:
        """Get embedding from cache if available.
        
        Args:
            text: Text to get embedding for
            model: Model name used
            dimensions: Optional dimensions
            
        Returns:
            Cached embedding or None if not found
        """
        if not self.enabled:
            return None
            
        try:
            key = self._generate_key(text, model, dimensions)
            cached_data = self.redis_client.get(key)
            
            if cached_data:
                embedding = json.loads(cached_data)
                logger.debug(f"Cache hit for text hash {key}")
                return embedding
                
        except (RedisError, json.JSONDecodeError) as e:
            logger.error(f"Cache get error: {e}")
            
        return None
    
    def set(self, text: str, model: str, embedding: List[float], dimensions: Optional[int] = None):
        """Store embedding in cache.
        
        Args:
            text: Original text
            model: Model name used
            embedding: Embedding vector
            dimensions: Optional dimensions
        """
        if not self.enabled:
            return
            
        try:
            key = self._generate_key(text, model, dimensions)
            value = json.dumps(embedding)
            
            # Store with TTL
            self.redis_client.setex(
                key,
                self.ttl,
                value
            )
            logger.debug(f"Cached embedding for text hash {key}")
            
        except (RedisError, json.JSONEncodeError) as e:
            logger.error(f"Cache set error: {e}")
    
    def get_batch(self, texts: List[str], model: str, dimensions: Optional[int] = None) -> Dict[int, List[float]]:
        """Get multiple embeddings from cache.
        
        Args:
            texts: List of texts
            model: Model name
            dimensions: Optional dimensions
            
        Returns:
            Dictionary mapping text index to embedding (only for cache hits)
        """
        if not self.enabled:
            return {}
            
        cached_embeddings = {}
        
        try:
            # Build pipeline for batch get
            pipe = self.redis_client.pipeline()
            keys = []
            
            for i, text in enumerate(texts):
                key = self._generate_key(text, model, dimensions)
                keys.append((i, key))
                pipe.get(key)
            
            # Execute pipeline
            results = pipe.execute()
            
            # Process results
            for (i, key), result in zip(keys, results):
                if result:
                    try:
                        embedding = json.loads(result)
                        cached_embeddings[i] = embedding
                    except json.JSONDecodeError:
                        logger.error(f"Invalid cached data for key {key}")
                        
            if cached_embeddings:
                logger.info(f"Cache hit for {len(cached_embeddings)}/{len(texts)} texts")
                
        except RedisError as e:
            logger.error(f"Batch cache get error: {e}")
            
        return cached_embeddings
    
    def set_batch(self, text_embeddings: List[tuple], model: str, dimensions: Optional[int] = None):
        """Store multiple embeddings in cache.
        
        Args:
            text_embeddings: List of (text, embedding) tuples
            model: Model name
            dimensions: Optional dimensions
        """
        if not self.enabled:
            return
            
        try:
            # Build pipeline for batch set
            pipe = self.redis_client.pipeline()
            
            for text, embedding in text_embeddings:
                key = self._generate_key(text, model, dimensions)
                value = json.dumps(embedding)
                pipe.setex(key, self.ttl, value)
            
            # Execute pipeline
            pipe.execute()
            logger.info(f"Cached {len(text_embeddings)} embeddings")
            
        except (RedisError, json.JSONEncodeError) as e:
            logger.error(f"Batch cache set error: {e}")
    
    def clear(self, pattern: Optional[str] = None):
        """Clear cache entries.
        
        Args:
            pattern: Optional pattern to match keys (default: all embedding cache)
        """
        if not self.enabled:
            return
            
        try:
            if pattern:
                search_pattern = f"embed_cache:*{pattern}*"
            else:
                search_pattern = "embed_cache:*"
                
            # Find and delete matching keys
            keys = list(self.redis_client.scan_iter(match=search_pattern))
            if keys:
                deleted = self.redis_client.delete(*keys)
                logger.info(f"Cleared {deleted} cache entries")
            else:
                logger.info("No cache entries to clear")
                
        except RedisError as e:
            logger.error(f"Cache clear error: {e}")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        if not self.enabled:
            return {'enabled': False}
            
        try:
            # Count cache entries
            count = 0
            for _ in self.redis_client.scan_iter(match="embed_cache:*"):
                count += 1
                
            return {
                'enabled': True,
                'entries': count,
                'ttl_hours': self.ttl.total_seconds() / 3600
            }
            
        except RedisError as e:
            logger.error(f"Cache stats error: {e}")
            return {
                'enabled': True,
                'error': str(e)
            }