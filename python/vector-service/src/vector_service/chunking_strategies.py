"""
Content chunking strategies for different types of content.
Implements intelligent chunking based on content characteristics.
"""

import re
import hashlib
import logging
from typing import List, Dict, Any, Optional, Tuple
from abc import ABC, abstractmethod

from langchain.text_splitter import (
    RecursiveCharacterTextSplitter,
    TokenTextSplitter,
    SentenceTransformersTokenTextSplitter
)
import tiktoken

from .models import (
    ContentChunk,
    ChunkStrategy,
    ChunkingConfig,
    ContentType,
    EmbeddingMetadata,
    TranscriptSegment
)
from .embedding_service import EmbeddingModel

logger = logging.getLogger(__name__)


class ChunkingStrategy(ABC):
    """Abstract base class for chunking strategies."""
    
    def __init__(self, config: ChunkingConfig):
        self.config = config
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
    
    @abstractmethod
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Chunk content into smaller pieces."""
        pass
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text."""
        return len(self.tokenizer.encode(text))
    
    def generate_content_hash(self, text: str) -> str:
        """Generate hash for content deduplication."""
        return hashlib.sha256(text.encode()).hexdigest()[:16]


class NoChunkingStrategy(ChunkingStrategy):
    """Strategy for short content that doesn't need chunking."""
    
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Return content as a single chunk."""
        token_count = self.count_tokens(content)
        
        return [ContentChunk(
            text=content,
            metadata=EmbeddingMetadata(
                share_id=share_id,
                chunk_index=0,
                total_chunks=1,
                start_offset=0,
                end_offset=len(content),
                content_hash=self.generate_content_hash(content)
            ),
            token_count=token_count
        )]


class TranscriptChunkingStrategy(ChunkingStrategy):
    """
    Strategy for chunking transcripts using natural segment boundaries.
    Uses Whisper segments as natural boundaries for chunking.
    """
    
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Chunk transcript using segment boundaries."""
        if not metadata or 'segments' not in metadata:
            # Fallback to paragraph chunking if no segments
            logger.warning("No segments found in metadata, falling back to paragraph chunking")
            return ParagraphChunkingStrategy(self.config).chunk(content, share_id, metadata)
        
        segments = [TranscriptSegment(**seg) for seg in metadata['segments']]
        chunks = []
        
        # Group segments into chunks of 30-60 seconds
        current_chunk_segments = []
        current_chunk_duration = 0
        current_chunk_start = None
        
        for segment in segments:
            if current_chunk_start is None:
                current_chunk_start = segment.start
            
            # Add segment to current chunk
            current_chunk_segments.append(segment)
            current_chunk_duration = segment.end - current_chunk_start
            
            # Check if we should create a new chunk
            should_create_chunk = (
                current_chunk_duration >= 30 or  # Minimum 30 seconds
                (current_chunk_duration >= 60) or  # Maximum 60 seconds
                segment == segments[-1]  # Last segment
            )
            
            if should_create_chunk and current_chunk_segments:
                # Create chunk with overlap
                chunk_text = self._create_chunk_with_overlap(
                    current_chunk_segments,
                    segments,
                    chunks
                )
                
                # Calculate offsets
                start_offset = sum(len(s.text) for s in segments[:segments.index(current_chunk_segments[0])])
                end_offset = start_offset + len(chunk_text)
                
                chunk = ContentChunk(
                    text=chunk_text,
                    metadata=EmbeddingMetadata(
                        share_id=share_id,
                        chunk_index=len(chunks),
                        total_chunks=0,  # Will be updated later
                        start_offset=start_offset,
                        end_offset=end_offset,
                        start_time=current_chunk_segments[0].start,
                        end_time=current_chunk_segments[-1].end,
                        content_hash=self.generate_content_hash(chunk_text)
                    ),
                    token_count=self.count_tokens(chunk_text)
                )
                
                chunks.append(chunk)
                
                # Reset for next chunk
                current_chunk_segments = []
                current_chunk_duration = 0
                current_chunk_start = None
        
        # Update total chunks count
        for chunk in chunks:
            chunk.metadata.total_chunks = len(chunks)
        
        logger.info(f"Created {len(chunks)} chunks from {len(segments)} segments")
        return chunks
    
    def _create_chunk_with_overlap(
        self,
        current_segments: List[TranscriptSegment],
        all_segments: List[TranscriptSegment],
        previous_chunks: List[ContentChunk]
    ) -> str:
        """Create chunk text with overlap from previous/next segments."""
        texts = []
        
        # Add overlap from previous chunk if exists
        if previous_chunks and self.config.segment_overlap_seconds > 0:
            current_start_idx = all_segments.index(current_segments[0])
            overlap_start_time = current_segments[0].start - self.config.segment_overlap_seconds
            
            # Find segments that fall within overlap period
            for i in range(current_start_idx - 1, -1, -1):
                if all_segments[i].end >= overlap_start_time:
                    texts.insert(0, all_segments[i].text)
                else:
                    break
        
        # Add current segments
        texts.extend([seg.text for seg in current_segments])
        
        # Add overlap for next chunk if not last
        if current_segments[-1] != all_segments[-1] and self.config.segment_overlap_seconds > 0:
            current_end_idx = all_segments.index(current_segments[-1])
            overlap_end_time = current_segments[-1].end + self.config.segment_overlap_seconds
            
            # Find segments that fall within overlap period
            for i in range(current_end_idx + 1, len(all_segments)):
                if all_segments[i].start <= overlap_end_time:
                    texts.append(all_segments[i].text)
                else:
                    break
        
        return " ".join(texts)


class ParagraphChunkingStrategy(ChunkingStrategy):
    """Strategy for chunking long-form content by paragraphs."""
    
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Chunk content by paragraphs with smart boundaries."""
        # Use RecursiveCharacterTextSplitter with paragraph-aware separators
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.config.max_chunk_size * 4,  # Approximate chars per token
            chunk_overlap=int(self.config.max_chunk_size * self.config.chunk_overlap * 4),
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=self.count_tokens
        )
        
        # Split text
        splits = text_splitter.split_text(content)
        
        # Convert to chunks
        chunks = []
        current_offset = 0
        
        for i, split_text in enumerate(splits):
            # Skip empty chunks
            if not split_text.strip():
                continue
            
            # Find actual position in original content
            start_offset = content.find(split_text, current_offset)
            if start_offset == -1:
                # Fallback if exact match not found
                start_offset = current_offset
            
            end_offset = start_offset + len(split_text)
            current_offset = end_offset
            
            # Calculate overlap
            overlap_start = None
            overlap_end = None
            
            if i > 0:
                # Find overlap with previous chunk
                prev_end = chunks[-1].metadata.end_offset
                if start_offset < prev_end:
                    overlap_start = prev_end - start_offset
            
            chunk = ContentChunk(
                text=split_text,
                metadata=EmbeddingMetadata(
                    share_id=share_id,
                    chunk_index=i,
                    total_chunks=0,  # Will be updated later
                    start_offset=start_offset,
                    end_offset=end_offset,
                    content_hash=self.generate_content_hash(split_text)
                ),
                token_count=self.count_tokens(split_text),
                overlap_start=overlap_start
            )
            
            chunks.append(chunk)
        
        # Update total chunks and limit if needed
        total_chunks = min(len(chunks), self.config.max_chunks)
        chunks = chunks[:total_chunks]
        
        for chunk in chunks:
            chunk.metadata.total_chunks = total_chunks
        
        logger.info(f"Created {len(chunks)} paragraph chunks")
        return chunks


class SentenceChunkingStrategy(ChunkingStrategy):
    """Strategy for chunking by sentences with context."""
    
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Chunk content by sentences with surrounding context."""
        # Split into sentences
        sentences = self._split_sentences(content)
        
        chunks = []
        i = 0
        
        while i < len(sentences):
            # Build chunk with target size
            chunk_sentences = []
            chunk_tokens = 0
            
            # Add sentences until we reach target size
            while i < len(sentences) and chunk_tokens < self.config.max_chunk_size:
                sentence = sentences[i]
                sentence_tokens = self.count_tokens(sentence)
                
                if chunk_tokens + sentence_tokens > self.config.max_chunk_size and chunk_sentences:
                    break
                
                chunk_sentences.append(sentence)
                chunk_tokens += sentence_tokens
                i += 1
            
            # Add context sentences if configured
            if self.config.sentence_buffer > 0 and chunks:
                # Add sentences from end of previous chunk
                prev_sentences = chunks[-1].text.split('. ')[-self.config.sentence_buffer:]
                chunk_sentences = prev_sentences + chunk_sentences
            
            chunk_text = '. '.join(chunk_sentences)
            if not chunk_text.endswith('.'):
                chunk_text += '.'
            
            # Calculate offsets
            start_offset = content.find(chunk_sentences[0])
            end_offset = start_offset + len(chunk_text)
            
            chunk = ContentChunk(
                text=chunk_text,
                metadata=EmbeddingMetadata(
                    share_id=share_id,
                    chunk_index=len(chunks),
                    total_chunks=0,  # Will be updated later
                    start_offset=start_offset,
                    end_offset=end_offset,
                    content_hash=self.generate_content_hash(chunk_text)
                ),
                token_count=self.count_tokens(chunk_text)
            )
            
            chunks.append(chunk)
        
        # Update total chunks
        for chunk in chunks:
            chunk.metadata.total_chunks = len(chunks)
        
        logger.info(f"Created {len(chunks)} sentence chunks")
        return chunks
    
    def _split_sentences(self, text: str) -> List[str]:
        """Split text into sentences."""
        # Simple sentence splitting - could be improved with NLTK or spaCy
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]


class FixedSizeChunkingStrategy(ChunkingStrategy):
    """Strategy for fixed-size token-based chunking."""
    
    def chunk(
        self,
        content: str,
        share_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> List[ContentChunk]:
        """Chunk content into fixed-size token chunks."""
        # Use TokenTextSplitter for precise token-based splitting
        text_splitter = TokenTextSplitter(
            chunk_size=self.config.max_chunk_size,
            chunk_overlap=int(self.config.max_chunk_size * self.config.chunk_overlap)
        )
        
        splits = text_splitter.split_text(content)
        
        chunks = []
        current_offset = 0
        
        for i, split_text in enumerate(splits):
            if not split_text.strip():
                continue
            
            start_offset = content.find(split_text, current_offset)
            if start_offset == -1:
                start_offset = current_offset
            
            end_offset = start_offset + len(split_text)
            current_offset = end_offset
            
            chunk = ContentChunk(
                text=split_text,
                metadata=EmbeddingMetadata(
                    share_id=share_id,
                    chunk_index=i,
                    total_chunks=0,  # Will be updated later
                    start_offset=start_offset,
                    end_offset=end_offset,
                    content_hash=self.generate_content_hash(split_text)
                ),
                token_count=self.count_tokens(split_text)
            )
            
            chunks.append(chunk)
        
        # Update total chunks and limit if needed
        total_chunks = min(len(chunks), self.config.max_chunks)
        chunks = chunks[:total_chunks]
        
        for chunk in chunks:
            chunk.metadata.total_chunks = total_chunks
        
        logger.info(f"Created {len(chunks)} fixed-size chunks")
        return chunks


class ChunkingService:
    """Service for managing content chunking strategies."""
    
    def __init__(self):
        """Initialize the chunking service."""
        self.strategies = {
            ChunkStrategy.NONE: NoChunkingStrategy,
            ChunkStrategy.TRANSCRIPT: TranscriptChunkingStrategy,
            ChunkStrategy.PARAGRAPH: ParagraphChunkingStrategy,
            ChunkStrategy.SENTENCE: SentenceChunkingStrategy,
            ChunkStrategy.FIXED_SIZE: FixedSizeChunkingStrategy
        }
        
        logger.info("Initialized ChunkingService")
    
    def select_strategy(
        self,
        content_type: ContentType,
        content_length: int,
        has_segments: bool = False
    ) -> ChunkStrategy:
        """Select appropriate chunking strategy based on content characteristics."""
        # Short content doesn't need chunking
        if content_length < 1000:  # Approximate character count
            return ChunkStrategy.NONE
        
        # Content-specific strategies
        if content_type == ContentType.TRANSCRIPT and has_segments:
            return ChunkStrategy.TRANSCRIPT
        elif content_type in [ContentType.ARTICLE, ContentType.COMPOSITE]:
            return ChunkStrategy.PARAGRAPH
        elif content_type == ContentType.CAPTION and content_length > 1000:
            return ChunkStrategy.SENTENCE
        elif content_type in [ContentType.TWEET, ContentType.COMMENT]:
            return ChunkStrategy.NONE
        
        # Default to paragraph chunking for unknown types
        return ChunkStrategy.PARAGRAPH
    
    def chunk_content(
        self,
        content: str,
        share_id: str,
        content_type: ContentType,
        config: Optional[ChunkingConfig] = None,
        metadata: Optional[Dict[str, Any]] = None,
        force_strategy: Optional[ChunkStrategy] = None
    ) -> List[ContentChunk]:
        """
        Chunk content using appropriate strategy.
        
        Args:
            content: Text content to chunk
            share_id: ID of the share
            content_type: Type of content
            config: Chunking configuration
            metadata: Additional metadata (e.g., transcript segments)
            force_strategy: Force a specific strategy
        
        Returns:
            List of content chunks
        """
        # Use default config if not provided
        if config is None:
            config = ChunkingConfig()
        
        # Select strategy
        if force_strategy:
            strategy_type = force_strategy
        else:
            has_segments = bool(metadata and metadata.get('segments'))
            strategy_type = self.select_strategy(
                content_type,
                len(content),
                has_segments
            )
        
        logger.info(
            f"Chunking {content_type} content with {strategy_type} strategy "
            f"(length: {len(content)} chars)"
        )
        
        # Get strategy class and instantiate
        strategy_class = self.strategies[strategy_type]
        strategy = strategy_class(config)
        
        # Perform chunking
        chunks = strategy.chunk(content, share_id, metadata)
        
        # Validate chunks don't exceed limits
        if len(chunks) > config.max_chunks:
            logger.warning(
                f"Chunking produced {len(chunks)} chunks, limiting to {config.max_chunks}"
            )
            chunks = chunks[:config.max_chunks]
        
        return chunks
    
    def estimate_chunks(
        self,
        content: str,
        content_type: ContentType,
        config: Optional[ChunkingConfig] = None
    ) -> int:
        """Estimate number of chunks without actually chunking."""
        if config is None:
            config = ChunkingConfig()
        
        tokenizer = tiktoken.get_encoding("cl100k_base")
        total_tokens = len(tokenizer.encode(content))
        
        if total_tokens <= config.max_chunk_size:
            return 1
        
        # Estimate based on chunk size and overlap
        effective_chunk_size = config.max_chunk_size * (1 - config.chunk_overlap)
        estimated_chunks = int(total_tokens / effective_chunk_size) + 1
        
        return min(estimated_chunks, config.max_chunks)