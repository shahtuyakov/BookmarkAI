"""Celery tasks for LLM summarization service."""

import time
from typing import Dict, Any, Optional
from uuid import UUID

from celery import Task
from celery_singleton import Singleton
from opentelemetry import trace

from common.celery_app import celery_app
from common.database import save_ml_result, get_ml_result, update_share_status
from common.utils import generate_dedup_key
from common.observability import get_tracer
from summarizer import LLMSummarizer


# Initialize summarizer (reused across tasks)
_summarizer: Optional[LLMSummarizer] = None


def get_summarizer() -> LLMSummarizer:
    """Get or create the global summarizer instance."""
    global _summarizer
    if _summarizer is None:
        _summarizer = LLMSummarizer()
    return _summarizer


@celery_app.task(
    name="llm_service.tasks.summarize_llm",
    base=Singleton,
    lock_expiry=600,  # 10 minute lock
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def summarize_llm(
    self: Task,
    shareId: str,
    payload: Dict[str, Any],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Summarize text content using LLM.
    
    This task uses celery-singleton to prevent duplicate processing.
    
    Args:
        shareId: UUID of the share being processed
        payload: Task payload containing:
            - text: Text to summarize
            - maxTokens: Optional max tokens for summary
            - style: Optional style (concise, detailed, bullet_points)
        metadata: Task metadata containing:
            - correlationId: Correlation ID for tracing
            - timestamp: Task creation timestamp
            - retryCount: Number of retries
            - traceparent: Optional W3C trace context
    
    Returns:
        Result dictionary with summary data
    """
    tracer = get_tracer()
    
    with tracer.start_as_current_span(
        "summarize_llm",
        attributes={
            "share.id": shareId,
            "task.type": "summarize_llm",
            "retry.count": metadata.get("retryCount", 0),
        },
    ) as span:
        start_time = time.time()
        
        try:
            # Validate inputs
            text = payload.get("text")
            if not text:
                raise ValueError("text is required")
            
            # Check if result already exists
            existing_result = get_ml_result(UUID(shareId), "summarize_llm")
            if existing_result:
                span.set_attribute("cache.hit", True)
                return {
                    "success": True,
                    "shareId": shareId,
                    "taskType": "summarize_llm",
                    "result": existing_result["result_data"],
                    "cached": True,
                    "processingMs": 0,
                }
            
            # Update share status
            update_share_status(UUID(shareId), "summarizing")
            
            # Get summarizer and process
            summarizer = get_summarizer()
            max_tokens = payload.get("maxTokens", 150)
            style = payload.get("style", "concise")
            
            span.set_attribute("llm.max_tokens", max_tokens)
            span.set_attribute("llm.style", style)
            span.set_attribute("llm.model", summarizer.model)
            
            # Perform summarization
            result = summarizer.summarize_text(
                text=text,
                max_tokens=max_tokens,
                style=style,
            )
            
            # Calculate processing time
            processing_ms = int((time.time() - start_time) * 1000)
            
            # Save result to database
            save_ml_result(
                share_id=UUID(shareId),
                task_type="summarize_llm",
                result_data=result,
                model_version=result["model"],
                processing_ms=processing_ms,
            )
            
            # Update share status
            update_share_status(
                UUID(shareId),
                "summarized",
                metadata={"has_summary": True, "summary_style": style},
            )
            
            span.set_attribute("llm.input_tokens", result.get("input_tokens", 0))
            span.set_attribute("llm.output_tokens", result.get("output_tokens", 0))
            span.set_status(trace.Status(trace.StatusCode.OK))
            
            return {
                "success": True,
                "shareId": shareId,
                "taskType": "summarize_llm",
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
                    "summarization_failed",
                    metadata={"error": str(e), "error_type": type(e).__name__},
                )
            except Exception:
                pass
            
            # Re-raise for Celery retry mechanism
            raise self.retry(exc=e, countdown=30 * (metadata.get("retryCount", 0) + 1))