"""
Contract validation models for ML tasks using Pydantic
"""
from .base import MLTaskMetadata, BaseMLTask, MLTaskType
from .summarization import SummarizationTask, SummarizationContent, SummarizationOptions
from .transcription import TranscriptionTask, TranscriptionContent, TranscriptionOptions
from .embedding import (
    EmbeddingTask,
    EmbeddingContent,
    EmbeddingOptions,
    BatchEmbeddingTask,
    BatchEmbeddingItem,
)
from .validators import validate_contract

__all__ = [
    # Base
    "MLTaskMetadata",
    "BaseMLTask",
    "MLTaskType",
    # Summarization
    "SummarizationTask",
    "SummarizationContent",
    "SummarizationOptions",
    # Transcription
    "TranscriptionTask",
    "TranscriptionContent",
    "TranscriptionOptions",
    # Embedding
    "EmbeddingTask",
    "EmbeddingContent",
    "EmbeddingOptions",
    "BatchEmbeddingTask",
    "BatchEmbeddingItem",
    # Validators
    "validate_contract",
]