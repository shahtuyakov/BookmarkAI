"""
Summarization task contract models
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field, HttpUrl
from .base import BaseMLTask, MLTaskType


class SummarizationContent(BaseModel):
    """Content for summarization tasks"""
    text: str = Field(min_length=1)
    title: Optional[str] = None
    url: Optional[HttpUrl] = None
    contentType: Optional[str] = Field(None, alias="content_type")

    class Config:
        populate_by_name = True


class SummarizationOptions(BaseModel):
    """Options for summarization tasks"""
    provider: Optional[Literal["openai", "anthropic", "local"]] = None
    model: Optional[str] = None
    maxLength: Optional[int] = Field(None, gt=0, alias="max_length")
    style: Optional[Literal["brief", "detailed", "bullets"]] = None
    backend: Optional[Literal["api", "local"]] = None

    class Config:
        populate_by_name = True


class SummarizationPayload(BaseModel):
    """Payload for summarization tasks"""
    content: SummarizationContent
    options: Optional[SummarizationOptions] = None


class SummarizationTask(BaseMLTask):
    """Complete summarization task model"""
    taskType: Literal[MLTaskType.SUMMARIZE_LLM] = MLTaskType.SUMMARIZE_LLM
    payload: SummarizationPayload

    class Config:
        populate_by_name = True
        use_enum_values = True