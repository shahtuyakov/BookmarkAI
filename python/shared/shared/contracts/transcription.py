"""
Transcription task contract models
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field, HttpUrl
from .base import BaseMLTask, MLTaskType


class TranscriptionContent(BaseModel):
    """Content for transcription tasks"""
    mediaUrl: HttpUrl = Field(alias="media_url")

    class Config:
        populate_by_name = True


class TranscriptionOptions(BaseModel):
    """Options for transcription tasks"""
    language: Optional[str] = None
    backend: Optional[Literal["api", "local"]] = None
    normalize: bool = True
    prompt: Optional[str] = None

    class Config:
        populate_by_name = True


class TranscriptionPayload(BaseModel):
    """Payload for transcription tasks"""
    content: TranscriptionContent
    options: Optional[TranscriptionOptions] = None


class TranscriptionTask(BaseMLTask):
    """Complete transcription task model"""
    taskType: Literal[MLTaskType.TRANSCRIBE_WHISPER] = MLTaskType.TRANSCRIBE_WHISPER
    payload: TranscriptionPayload

    class Config:
        populate_by_name = True
        use_enum_values = True