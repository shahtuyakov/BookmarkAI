"""
Data models for the vector embedding service.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field, UUID4


class ContentType(str, Enum):
    """Types of content that can be embedded."""
    CAPTION = "caption"        # TikTok/Instagram captions
    TRANSCRIPT = "transcript"  # Video/audio transcripts
    ARTICLE = "article"       # Long-form articles
    TWEET = "tweet"           # Short tweets
    COMMENT = "comment"       # Reddit comments
    SUMMARY = "summary"       # AI-generated summaries
    COMPOSITE = "composite"   # Mixed content


class ChunkStrategy(str, Enum):
    """Chunking strategies for different content types."""
    NONE = "none"                    # No chunking (short content)
    TRANSCRIPT = "transcript"        # Use transcript segments
    PARAGRAPH = "paragraph"          # Paragraph-based chunking
    SENTENCE = "sentence"            # Sentence-based chunking
    FIXED_SIZE = "fixed_size"        # Fixed token size chunks


class EmbeddingMetadata(BaseModel):
    """Metadata for an embedding."""
    share_id: UUID4
    chunk_index: int = 0
    total_chunks: int = 1
    start_offset: Optional[int] = None      # Character offset
    end_offset: Optional[int] = None        # Character offset
    start_time: Optional[float] = None      # For transcripts (seconds)
    end_time: Optional[float] = None        # For transcripts (seconds)
    content_hash: str                       # For deduplication
    parent_id: Optional[UUID4] = None       # For hierarchical embeddings


class ContentChunk(BaseModel):
    """A chunk of content ready for embedding."""
    text: str
    metadata: EmbeddingMetadata
    token_count: int
    overlap_start: Optional[int] = None     # Overlap with previous chunk
    overlap_end: Optional[int] = None       # Overlap with next chunk


class EmbeddingTask(BaseModel):
    """Task model for embedding generation."""
    share_id: UUID4
    content: Dict[str, Any]
    options: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    class Config:
        json_schema_extra = {
            "example": {
                "share_id": "123e4567-e89b-12d3-a456-426614174000",
                "content": {
                    "text": "This is a sample content to embed",
                    "type": "caption",
                    "metadata": {
                        "title": "Sample Title",
                        "segments": []
                    }
                },
                "options": {
                    "embedding_type": "content",
                    "force_model": "text-embedding-3-small",
                    "chunk_strategy": "none"
                }
            }
        }


class EmbeddingResult(BaseModel):
    """Result of embedding generation."""
    share_id: UUID4
    embeddings: List[Dict[str, Any]]  # List of embedding records
    model: str
    total_tokens: int
    total_cost: float
    processing_time_ms: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_schema_extra = {
            "example": {
                "share_id": "123e4567-e89b-12d3-a456-426614174000",
                "embeddings": [
                    {
                        "embedding": [0.1, 0.2, 0.3],
                        "metadata": {
                            "chunk_index": 0,
                            "total_chunks": 1,
                            "content_hash": "abc123"
                        }
                    }
                ],
                "model": "text-embedding-3-small",
                "total_tokens": 150,
                "total_cost": 0.000003,
                "processing_time_ms": 250
            }
        }


class ChunkingConfig(BaseModel):
    """Configuration for content chunking."""
    strategy: ChunkStrategy = ChunkStrategy.NONE
    max_chunk_size: int = Field(default=600, description="Maximum tokens per chunk")
    chunk_overlap: float = Field(default=0.15, description="Overlap percentage (0-1)")
    respect_boundaries: bool = Field(default=True, description="Respect natural boundaries")
    max_chunks: int = Field(default=30, description="Maximum chunks per document")
    
    # Strategy-specific settings
    min_paragraph_length: int = Field(default=100, description="Minimum paragraph length")
    sentence_buffer: int = Field(default=2, description="Sentences to include for context")
    segment_overlap_seconds: float = Field(default=5.0, description="Overlap for transcript segments")


class TranscriptSegment(BaseModel):
    """A segment from a transcript."""
    text: str
    start: float  # Start time in seconds
    end: float    # End time in seconds
    
    @property
    def duration(self) -> float:
        """Duration of the segment in seconds."""
        return self.end - self.start


class EmbeddingStats(BaseModel):
    """Statistics for embedding operations."""
    total_embeddings: int = 0
    total_chunks: int = 0
    total_tokens: int = 0
    total_cost: float = 0.0
    model_usage: Dict[str, int] = Field(default_factory=dict)
    content_type_distribution: Dict[str, int] = Field(default_factory=dict)
    avg_chunk_size: float = 0.0
    avg_processing_time_ms: float = 0.0