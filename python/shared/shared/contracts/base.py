"""
Base models for ML task contracts
"""
from enum import Enum
from typing import Optional, Literal
from pydantic import BaseModel, Field, UUID4
import uuid
import time


class MLTaskType(str, Enum):
    """ML task type enumeration"""
    SUMMARIZE_LLM = "summarize_llm"
    TRANSCRIBE_WHISPER = "transcribe_whisper"
    EMBED_VECTORS = "embed_vectors"


class MLTaskMetadata(BaseModel):
    """Metadata for all ML tasks"""
    correlationId: UUID4 = Field(default_factory=uuid.uuid4, alias="correlation_id")
    timestamp: int = Field(default_factory=lambda: int(time.time() * 1000))
    retryCount: int = Field(default=0, ge=0, alias="retry_count")
    traceparent: Optional[str] = None
    tracestate: Optional[str] = None

    class Config:
        populate_by_name = True


class BaseMLTask(BaseModel):
    """Base model that all ML tasks must inherit from"""
    version: Literal["1.0"] = "1.0"
    taskType: MLTaskType = Field(alias="task_type")
    shareId: str = Field(min_length=1, alias="share_id")
    metadata: MLTaskMetadata

    class Config:
        populate_by_name = True
        use_enum_values = True