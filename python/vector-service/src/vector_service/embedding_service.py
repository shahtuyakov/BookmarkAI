"""
Embedding service for generating vector embeddings using OpenAI.
Implements dynamic model selection based on content characteristics.
"""

import os
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

import tiktoken
from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
from pydantic import BaseModel, Field
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class EmbeddingModel(str, Enum):
    """Available embedding models."""
    SMALL = "text-embedding-3-small"
    LARGE = "text-embedding-3-large"
    ADA_002 = "text-embedding-ada-002"  # Legacy, kept for compatibility


class EmbeddingType(str, Enum):
    """Types of embeddings based on use case."""
    SUMMARY = "summary"      # High-level representation
    CONTENT = "content"      # Detailed content chunks
    COMPOSITE = "composite"  # Combined metadata + content


@dataclass
class ModelConfig:
    """Configuration for an embedding model."""
    name: str
    dimensions: int
    max_tokens: int
    cost_per_1k_tokens: float  # in USD


# Model configurations with pricing
MODEL_CONFIGS = {
    EmbeddingModel.SMALL: ModelConfig(
        name="text-embedding-3-small",
        dimensions=1536,
        max_tokens=8191,
        cost_per_1k_tokens=0.00002
    ),
    EmbeddingModel.LARGE: ModelConfig(
        name="text-embedding-3-large",
        dimensions=3072,
        max_tokens=8191,
        cost_per_1k_tokens=0.00013
    ),
    EmbeddingModel.ADA_002: ModelConfig(
        name="text-embedding-ada-002",
        dimensions=1536,
        max_tokens=8191,
        cost_per_1k_tokens=0.0001
    ),
}


class EmbeddingRequest(BaseModel):
    """Request model for embedding generation."""
    text: str
    embedding_type: EmbeddingType = EmbeddingType.CONTENT
    force_model: Optional[EmbeddingModel] = None
    dimensions: Optional[int] = None  # For dimension reduction


class EmbeddingResponse(BaseModel):
    """Response model for embedding generation."""
    embedding: List[float]
    model: str
    dimensions: int
    token_count: int
    cost: float
    embedding_type: EmbeddingType


class EmbeddingBatch(BaseModel):
    """Batch of texts for embedding."""
    texts: List[str]
    embedding_type: EmbeddingType = EmbeddingType.CONTENT
    force_model: Optional[EmbeddingModel] = None


class BatchEmbeddingResponse(BaseModel):
    """Response for batch embedding generation."""
    embeddings: List[List[float]]
    model: str
    dimensions: int
    total_tokens: int
    total_cost: float
    embedding_type: EmbeddingType


class EmbeddingService:
    """Service for generating embeddings with dynamic model selection."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the embedding service."""
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key is required")
        
        self.client = OpenAI(api_key=self.api_key)
        
        # Configuration from environment
        self.default_model = EmbeddingModel(
            os.getenv("VECTOR_DEFAULT_MODEL", EmbeddingModel.SMALL.value)
        )
        self.small_threshold = int(os.getenv("VECTOR_SMALL_MODEL_THRESHOLD", "1000"))
        self.large_threshold = int(os.getenv("VECTOR_LARGE_MODEL_THRESHOLD", "5000"))
        
        # Initialize tokenizers
        self._tokenizers = {}
        
        logger.info(
            f"Initialized EmbeddingService with default model: {self.default_model}, "
            f"thresholds: small<{self.small_threshold}, large>{self.large_threshold}"
        )
    
    def get_tokenizer(self, model: EmbeddingModel) -> tiktoken.Encoding:
        """Get or create tokenizer for a model."""
        if model not in self._tokenizers:
            # All current embedding models use cl100k_base encoding
            self._tokenizers[model] = tiktoken.get_encoding("cl100k_base")
        return self._tokenizers[model]
    
    def count_tokens(self, text: str, model: EmbeddingModel) -> int:
        """Count tokens for a given text and model."""
        tokenizer = self.get_tokenizer(model)
        return len(tokenizer.encode(text))
    
    def select_model(self, text: str, force_model: Optional[EmbeddingModel] = None) -> EmbeddingModel:
        """
        Select the appropriate model based on content length.
        
        Strategy:
        - < 1000 tokens: Use small model (cost-efficient)
        - > 5000 tokens: Use large model (better quality for long content)
        - 1000-5000 tokens: Use default model
        """
        if force_model:
            logger.debug(f"Using forced model: {force_model}")
            return force_model
        
        # Count tokens with the small model tokenizer (same for all models)
        token_count = self.count_tokens(text, EmbeddingModel.SMALL)
        
        if token_count < self.small_threshold:
            model = EmbeddingModel.SMALL
            logger.debug(f"Selected SMALL model for {token_count} tokens")
        elif token_count > self.large_threshold:
            model = EmbeddingModel.LARGE
            logger.debug(f"Selected LARGE model for {token_count} tokens")
        else:
            model = self.default_model
            logger.debug(f"Selected DEFAULT model ({self.default_model}) for {token_count} tokens")
        
        return model
    
    def estimate_cost(self, token_count: int, model: EmbeddingModel) -> float:
        """Estimate the cost for generating embeddings."""
        config = MODEL_CONFIGS[model]
        return (token_count / 1000) * config.cost_per_1k_tokens
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True
    )
    def generate_embedding(self, request: EmbeddingRequest) -> EmbeddingResponse:
        """Generate embedding for a single text."""
        # Create span for embedding generation
        with tracer.start_as_current_span(
            "embeddings.generate_single",
            kind=trace.SpanKind.CLIENT
        ) as span:
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
            
            # Estimate cost
            cost = self.estimate_cost(token_count, model)
            
            # Set span attributes
            span.set_attribute("embeddings.model", model.value)
            span.set_attribute("embeddings.type", request.embedding_type)
            span.set_attribute("embeddings.token_count", token_count)
            span.set_attribute("embeddings.estimated_cost", cost)
            span.set_attribute("embeddings.text_length", len(request.text))
            if request.dimensions:
                span.set_attribute("embeddings.requested_dimensions", request.dimensions)
            
            # Generate embedding
            logger.info(
                f"Generating {request.embedding_type} embedding with {model.value} "
                f"({token_count} tokens, ${cost:.6f})"
            )
            
            try:
                # Prepare API call parameters
                api_params = {
                    "model": config.name,
                    "input": request.text,
                }
                
                # Add dimension reduction if specified
                if request.dimensions and model in [EmbeddingModel.SMALL, EmbeddingModel.LARGE]:
                    api_params["dimensions"] = request.dimensions
                    
                response = self.client.embeddings.create(**api_params)
                
                embedding = response.data[0].embedding
                actual_dimensions = len(embedding)
                
                # Add response attributes
                span.set_attribute("embeddings.actual_dimensions", actual_dimensions)
                span.set_attribute("embeddings.actual_cost", cost)
                
                # Set success status
                span.set_status(Status(StatusCode.OK))
                
                return EmbeddingResponse(
                    embedding=embedding,
                    model=config.name,
                    dimensions=actual_dimensions,
                    token_count=token_count,
                    cost=cost,
                    embedding_type=request.embedding_type
                )
                
            except Exception as e:
                logger.error(f"Failed to generate embedding: {str(e)}")
                # Record exception in span
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10),
        reraise=True
    )
    def generate_batch_embeddings(self, batch: EmbeddingBatch) -> BatchEmbeddingResponse:
        """Generate embeddings for a batch of texts."""
        # Create span for batch embedding generation
        with tracer.start_as_current_span(
            "embeddings.generate_batch",
            kind=trace.SpanKind.CLIENT
        ) as span:
            if not batch.texts:
                raise ValueError("Batch cannot be empty")
            
            # OpenAI supports up to 2048 inputs per request
            if len(batch.texts) > 2048:
                raise ValueError("Batch size exceeds maximum limit (2048)")
            
            # Set batch size attribute
            span.set_attribute("embeddings.batch_size", len(batch.texts))
            span.set_attribute("embeddings.type", batch.embedding_type)
            
            # Select model based on the longest text
            max_tokens = 0
            total_tokens = 0
            for text in batch.texts:
                tokens = self.count_tokens(text, EmbeddingModel.SMALL)
                total_tokens += tokens
                max_tokens = max(max_tokens, tokens)
            
            # Use the longest text to determine model
            longest_text = max(batch.texts, key=len)
            model = self.select_model(longest_text, batch.force_model)
            config = MODEL_CONFIGS[model]
            
            # Check if any text exceeds token limit
            if max_tokens > config.max_tokens:
                raise ValueError(
                    f"One or more texts exceed maximum token limit ({max_tokens} > {config.max_tokens})"
                )
            
            # Estimate cost
            total_cost = self.estimate_cost(total_tokens, model)
            
            # Set span attributes
            span.set_attribute("embeddings.model", model.value)
            span.set_attribute("embeddings.total_tokens", total_tokens)
            span.set_attribute("embeddings.max_tokens", max_tokens)
            span.set_attribute("embeddings.estimated_cost", total_cost)
            
            logger.info(
                f"Generating batch of {len(batch.texts)} {batch.embedding_type} embeddings "
                f"with {model.value} ({total_tokens} total tokens, ${total_cost:.6f})"
            )
            
            try:
                response = self.client.embeddings.create(
                    model=config.name,
                    input=batch.texts
                )
                
                embeddings = [item.embedding for item in response.data]
                actual_dimensions = len(embeddings[0]) if embeddings else config.dimensions
                
                # Add response attributes
                span.set_attribute("embeddings.actual_dimensions", actual_dimensions)
                span.set_attribute("embeddings.embeddings_count", len(embeddings))
                
                # Set success status
                span.set_status(Status(StatusCode.OK))
                
                return BatchEmbeddingResponse(
                    embeddings=embeddings,
                    model=config.name,
                    dimensions=actual_dimensions,
                    total_tokens=total_tokens,
                    total_cost=total_cost,
                    embedding_type=batch.embedding_type
                )
                
            except Exception as e:
                logger.error(f"Failed to generate batch embeddings: {str(e)}")
                # Record exception in span
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
    
    def create_composite_embedding(
        self,
        content: str,
        metadata: Dict[str, Any],
        weights: Optional[Dict[str, float]] = None
    ) -> EmbeddingResponse:
        """
        Create a composite embedding combining content and metadata.
        
        Args:
            content: Main content text
            metadata: Dictionary of metadata (title, tags, etc.)
            weights: Optional weights for different components
        
        Returns:
            Composite embedding response
        """
        # Default weights
        if weights is None:
            weights = {
                "content": 0.7,
                "title": 0.2,
                "metadata": 0.1
            }
        
        # Build composite text
        components = []
        
        # Add content
        if content:
            components.append(f"Content: {content}")
        
        # Add metadata
        if metadata.get("title"):
            components.append(f"Title: {metadata['title']}")
        
        if metadata.get("description"):
            components.append(f"Description: {metadata['description']}")
        
        if metadata.get("tags"):
            tags = ", ".join(metadata['tags']) if isinstance(metadata['tags'], list) else metadata['tags']
            components.append(f"Tags: {tags}")
        
        # Combine components
        composite_text = "\n\n".join(components)
        
        # Generate embedding
        request = EmbeddingRequest(
            text=composite_text,
            embedding_type=EmbeddingType.COMPOSITE
        )
        
        return self.generate_embedding(request)