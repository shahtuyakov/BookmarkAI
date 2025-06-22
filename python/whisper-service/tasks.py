"""Celery tasks for Whisper transcription service."""

import time
from typing import Dict, Any, Optional
from uuid import UUID

from celery import Task
from celery_singleton import Singleton
from opentelemetry import trace

from common.celery_app import celery_app, task
from common.database import save_ml_result, get_ml_result, update_share_status
from common.utils import generate_dedup_key, format_error_response, validate_media_url
from common.observability import get_tracer
from transcriber import WhisperTranscriber


# Initialize transcriber (reused across tasks)
_transcriber: Optional[WhisperTranscriber] = None


def get_transcriber() -> WhisperTranscriber:
    """Get or create the global transcriber instance."""
    global _transcriber
    if _transcriber is None:
        # Use base model by default, can be configured via env
        model_size = "base"  # TODO: Make configurable
        _transcriber = WhisperTranscriber(model_size=model_size)
    return _transcriber


@celery_app.task(
    name="whisper_service.tasks.transcribe_whisper",
    base=Singleton,
    lock_expiry=3600,  # 1 hour lock expiry
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def transcribe_whisper(
    self: Task,
    shareId: str,
    payload: Dict[str, Any],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Transcribe audio/video content using Whisper.
    
    This task uses celery-singleton to prevent duplicate processing.
    
    Args:
        shareId: UUID of the share being processed
        payload: Task payload containing:
            - mediaUrl: URL of the media to transcribe
            - language: Optional language code
        metadata: Task metadata containing:
            - correlationId: Correlation ID for tracing
            - timestamp: Task creation timestamp
            - retryCount: Number of retries
            - traceparent: Optional W3C trace context
    
    Returns:
        Result dictionary with transcription data
    """
    tracer = get_tracer()
    
    # Extract trace context if available
    trace_context = metadata.get("traceparent")
    
    with tracer.start_as_current_span(
        "transcribe_whisper",
        attributes={
            "share.id": shareId,
            "task.type": "transcribe_whisper",
            "media.url": payload.get("mediaUrl", ""),
            "retry.count": metadata.get("retryCount", 0),
        },
    ) as span:
        start_time = time.time()
        
        try:
            # Validate inputs
            media_url = payload.get("mediaUrl")
            if not media_url:
                raise ValueError("mediaUrl is required")
            
            if not validate_media_url(media_url):
                raise ValueError(f"Invalid media URL: {media_url}")
            
            # Check if result already exists (dedup at storage level)
            existing_result = get_ml_result(UUID(shareId), "transcribe_whisper")
            if existing_result:
                span.set_attribute("cache.hit", True)
                return {
                    "success": True,
                    "shareId": shareId,
                    "taskType": "transcribe_whisper",
                    "result": existing_result["result_data"],
                    "cached": True,
                    "processingMs": 0,
                }
            
            # Update share status
            update_share_status(UUID(shareId), "transcribing")
            
            # Get transcriber and process
            transcriber = get_transcriber()
            language = payload.get("language")
            
            span.set_attribute("whisper.language", language or "auto")
            span.set_attribute("whisper.model", transcriber.model_size)
            
            # Perform transcription
            result = transcriber.transcribe_from_url(
                media_url=media_url,
                language=language,
            )
            
            # Calculate processing time
            processing_ms = int((time.time() - start_time) * 1000)
            
            # Save result to database
            save_ml_result(
                share_id=UUID(shareId),
                task_type="transcribe_whisper",
                result_data=result,
                model_version=f"whisper-{transcriber.model_size}",
                processing_ms=processing_ms,
            )
            
            # Update share status
            update_share_status(
                UUID(shareId),
                "transcribed",
                metadata={"has_transcript": True, "transcript_language": result.get("language")},
            )
            
            span.set_attribute("transcription.duration", result.get("duration", 0))
            span.set_attribute("transcription.segments", len(result.get("segments", [])))
            span.set_status(trace.Status(trace.StatusCode.OK))
            
            return {
                "success": True,
                "shareId": shareId,
                "taskType": "transcribe_whisper",
                "result": result,
                "cached": False,
                "processingMs": processing_ms,
            }
            
        except Exception as e:
            span.record_exception(e)
            span.set_status(
                trace.Status(trace.StatusCode.ERROR, str(e))
            )
            
            # Update share status to error
            try:
                update_share_status(
                    UUID(shareId),
                    "transcription_failed",
                    metadata={"error": str(e), "error_type": type(e).__name__},
                )
            except Exception:
                pass  # Don't fail the task if status update fails
            
            # Re-raise for Celery retry mechanism
            raise self.retry(exc=e, countdown=60 * (metadata.get("retryCount", 0) + 1))


# Task routing is configured in celery_app.py