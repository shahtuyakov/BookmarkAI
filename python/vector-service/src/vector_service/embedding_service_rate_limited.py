"""Rate-limited embedding service for generating vector embeddings using OpenAI."""

import os
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from .embedding_service import (
    EmbeddingService,
    EmbeddingModel,
    EmbeddingType,
    EmbeddingRequest,
    EmbeddingResponse,
    EmbeddingBatch,
    BatchEmbeddingResponse,
    MODEL_CONFIGS
)
from .rate_limited_client import RateLimitedEmbeddingClient, RateLimitError

logger = logging.getLogger(__name__)


class RateLimitedEmbeddingService(EmbeddingService):
    """Embedding service with integrated rate limiting and batch optimization."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the rate-limited embedding service."""
        # Initialize parent class
        super().__init__(api_key)
        
        # Check if rate limiting is enabled
        self.enable_rate_limiting = os.environ.get('ENABLE_EMBEDDINGS_RATE_LIMITING', 'true').lower() == 'true'
        
        # Get batch size from environment
        self.batch_size = int(os.getenv("VECTOR_BATCH_SIZE", "100"))
        
        # Initialize rate limited client if enabled
        self.rate_limited_client = None
        if self.enable_rate_limiting:
            try:
                self.rate_limited_client = RateLimitedEmbeddingClient(
                    enable_rate_limiting=True,
                    batch_size=self.batch_size
                )
                logger.info(f"Initialized rate-limited embeddings client with batch size {self.batch_size}")
            except Exception as e:
                logger.error(f"Failed to initialize rate limiting: {e}")
                self.enable_rate_limiting = False
    
    def generate_embedding(self, request: EmbeddingRequest, identifier: Optional[str] = None) -> EmbeddingResponse:
        """Generate embedding for a single text with rate limiting.
        
        Args:
            request: Embedding request
            identifier: Optional identifier for rate limiting (defaults to 'global')
            
        Returns:
            EmbeddingResponse with embedding
            
        Raises:
            RateLimitError: If rate limited
        """
        # Use rate limited client if available
        if self.enable_rate_limiting and self.rate_limited_client:
            return self._generate_with_rate_limit(request, identifier)
        else:
            # Fallback to parent implementation
            return super().generate_embedding(request)
    
    def generate_batch_embeddings(self, batch: EmbeddingBatch, identifier: Optional[str] = None) -> BatchEmbeddingResponse:
        """Generate embeddings for a batch of texts with rate limiting and optimization.
        
        Args:
            batch: Batch of texts
            identifier: Optional identifier for rate limiting (defaults to 'global')
            
        Returns:
            BatchEmbeddingResponse with embeddings
            
        Raises:
            RateLimitError: If rate limited
        """
        # Use rate limited client if available
        if self.enable_rate_limiting and self.rate_limited_client:
            return self._generate_batch_with_rate_limit(batch, identifier)
        else:
            # Fallback to parent implementation
            return super().generate_batch_embeddings(batch)
    
    def _generate_with_rate_limit(self, request: EmbeddingRequest, identifier: Optional[str] = None) -> EmbeddingResponse:
        """Internal method to handle rate-limited single embedding."""
        # Select model
        model = self.select_model(request.text, request.force_model)
        config = MODEL_CONFIGS[model]
        
        # Count tokens
        token_count = self.count_tokens(request.text, model)
        if token_count > config.max_tokens:
            raise ValueError(
                f"Text exceeds maximum token limit ({token_count} > {config.max_tokens}). "
                "Please chunk the text before embedding."
            )
        
        # Use default identifier if not provided
        if not identifier:
            identifier = 'global'
        
        # Estimate cost
        cost = self.estimate_cost(token_count, model)
        
        # Generate embedding with rate limiting
        logger.info(
            f"Generating rate-limited {request.embedding_type} embedding with {model.value} "
            f"({token_count} tokens, ${cost:.6f})"
        )
        
        try:
            # Use batch API for single text (more efficient)
            result = self.rate_limited_client.create_embeddings_sync(
                texts=[request.text],
                model=config.name,
                identifier=identifier,
                dimensions=request.dimensions
            )
            
            if not result['embeddings']:
                raise ValueError("No embeddings returned")
                
            embedding = result['embeddings'][0]
            actual_dimensions = len(embedding)
            actual_tokens = result.get('total_tokens', token_count)
            
            return EmbeddingResponse(
                embedding=embedding,
                model=config.name,
                dimensions=actual_dimensions,
                token_count=actual_tokens,
                cost=self.estimate_cost(actual_tokens, model),
                embedding_type=request.embedding_type
            )
            
        except RateLimitError as e:
            logger.warning(f"Rate limit hit for embeddings: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Failed to generate embedding: {str(e)}")
            raise
    
    def _generate_batch_with_rate_limit(self, batch: EmbeddingBatch, identifier: Optional[str] = None) -> BatchEmbeddingResponse:
        """Internal method to handle rate-limited batch embeddings with optimization."""
        if not batch.texts:
            raise ValueError("Batch cannot be empty")
        
        # Use default identifier if not provided
        if not identifier:
            identifier = 'global'
        
        # Select model based on the longest text
        longest_text = max(batch.texts, key=len)
        model = self.select_model(longest_text, batch.force_model)
        config = MODEL_CONFIGS[model]
        
        # Get batch optimization stats
        if self.rate_limited_client:
            stats = self.rate_limited_client.get_batch_optimization_stats(batch.texts)
            logger.info(
                f"Batch optimization: {stats['total_texts']} texts, "
                f"{stats['total_tokens']} tokens, {stats['num_batches']} API requests"
            )
        
        # Generate embeddings with rate limiting
        logger.info(
            f"Generating rate-limited batch of {len(batch.texts)} {batch.embedding_type} embeddings "
            f"with {model.value}"
        )
        
        try:
            result = self.rate_limited_client.create_embeddings_sync(
                texts=batch.texts,
                model=config.name,
                identifier=identifier
            )
            
            embeddings = result['embeddings']
            if len(embeddings) != len(batch.texts):
                raise ValueError(
                    f"Embedding count mismatch: expected {len(batch.texts)}, got {len(embeddings)}"
                )
                
            actual_dimensions = len(embeddings[0]) if embeddings else config.dimensions
            total_tokens = result.get('total_tokens', 0)
            total_cost = self.estimate_cost(total_tokens, model)
            
            # Log batch processing stats
            logger.info(
                f"Processed {len(embeddings)} embeddings in {result.get('batches_processed', 1)} "
                f"API requests, {total_tokens} tokens, ${total_cost:.6f}"
            )
            
            return BatchEmbeddingResponse(
                embeddings=embeddings,
                model=config.name,
                dimensions=actual_dimensions,
                total_tokens=total_tokens,
                total_cost=total_cost,
                embedding_type=batch.embedding_type
            )
            
        except RateLimitError as e:
            logger.warning(f"Rate limit hit for batch embeddings: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Failed to generate batch embeddings: {str(e)}")
            raise
    
    def create_composite_embedding(
        self,
        content: str,
        metadata: Dict[str, Any],
        weights: Optional[Dict[str, float]] = None,
        identifier: Optional[str] = None
    ) -> EmbeddingResponse:
        """Create a composite embedding with rate limiting.
        
        Adds identifier parameter for rate limiting.
        """
        # Build composite text using parent method logic
        composite_request = super().create_composite_embedding(content, metadata, weights)
        
        # Generate with rate limiting if available
        if self.enable_rate_limiting and self.rate_limited_client and identifier:
            return self._generate_with_rate_limit(composite_request, identifier)
        else:
            return composite_request