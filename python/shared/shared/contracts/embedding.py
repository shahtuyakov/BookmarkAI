"""
Embedding task contract models
"""
from typing import Optional, Literal, List, Dict, Any
from pydantic import BaseModel, Field, validator
from .base import BaseMLTask, MLTaskType


class EmbeddingContent(BaseModel):
    """Content for embedding tasks"""
    text: str = Field(min_length=1)
    type: Literal["caption", "transcript", "article", "comment", "tweet"] = "caption"
    metadata: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        populate_by_name = True


class EmbeddingOptions(BaseModel):
    """Options for embedding tasks"""
    embedding_type: Literal["content", "summary", "composite"] = "content"
    force_model: Optional[Literal["text-embedding-3-small", "text-embedding-3-large"]] = None
    chunk_strategy: Optional[Literal["none", "transcript", "paragraph", "sentence", "fixed"]] = None
    backend: Optional[Literal["api", "local"]] = None

    class Config:
        populate_by_name = True


class EmbeddingPayload(BaseModel):
    """Payload for embedding tasks"""
    content: EmbeddingContent
    options: Optional[EmbeddingOptions] = None


class EmbeddingTask(BaseMLTask):
    """Complete embedding task model"""
    taskType: Literal[MLTaskType.EMBED_VECTORS] = MLTaskType.EMBED_VECTORS
    payload: EmbeddingPayload

    class Config:
        populate_by_name = True
        use_enum_values = True


# Batch embedding models
class BatchEmbeddingItem(BaseModel):
    """Single item in a batch embedding request"""
    share_id: str = Field(min_length=1)
    content: EmbeddingContent
    options: Optional[EmbeddingOptions] = None

    class Config:
        populate_by_name = True


class BatchEmbeddingPayload(BaseModel):
    """Payload for batch embedding tasks"""
    tasks: List[BatchEmbeddingItem]
    isBatch: Literal[True] = Field(True, alias="is_batch")

    class Config:
        populate_by_name = True


class BatchEmbeddingTask(BaseMLTask):
    """Batch embedding task model"""
    taskType: Literal[MLTaskType.EMBED_VECTORS] = MLTaskType.EMBED_VECTORS
    shareId: str = Field(regex=r"^batch-", alias="share_id")
    payload: BatchEmbeddingPayload

    @validator("shareId")
    def validate_batch_share_id(cls, v):
        if not v.startswith("batch-"):
            raise ValueError("Batch embedding tasks must have shareId starting with 'batch-'")
        return v

    class Config:
        populate_by_name = True
        use_enum_values = True