"""Celery tasks for vector embedding service."""

import time
from typing import Dict, Any, Optional
from uuid import UUID

from celery import Task
from celery_singleton import Singleton
from opentelemetry import trace

from common.celery_app import celery_app
from common.database import save_ml_result, get_ml_result, update_share_status, get_db_connection
from common.utils import generate_dedup_key
from common.observability import get_tracer
from embedder import VectorEmbedder


# Initialize embedder (reused across tasks)
_embedder: Optional[VectorEmbedder] = None


def get_embedder() -> VectorEmbedder:
    """Get or create the global embedder instance."""
    global _embedder
    if _embedder is None:
        _embedder = VectorEmbedder()
    return _embedder


@celery_app.task(
    name="vector_service.tasks.embed_vectors",
    base=Singleton,
    lock_expiry=600,  # 10 minute lock
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def embed_vectors(
    self: Task,
    shareId: str,
    payload: Dict[str, Any],
    metadata: Dict[str, Any],
) -> Dict[str, Any]:
    """Generate vector embeddings for text content.
    
    This task uses celery-singleton to prevent duplicate processing.
    
    Args:
        shareId: UUID of the share being processed
        payload: Task payload containing:
            - text: Text to embed
            - chunkSize: Optional chunk size in tokens
        metadata: Task metadata containing:
            - correlationId: Correlation ID for tracing
            - timestamp: Task creation timestamp
            - retryCount: Number of retries
            - traceparent: Optional W3C trace context
    
    Returns:
        Result dictionary with embedding data
    """
    tracer = get_tracer()
    
    with tracer.start_as_current_span(
        "embed_vectors",
        attributes={
            "share.id": shareId,
            "task.type": "embed_vectors",
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
            existing_result = get_ml_result(UUID(shareId), "embed_vectors")
            if existing_result:
                span.set_attribute("cache.hit", True)
                return {
                    "success": True,
                    "shareId": shareId,
                    "taskType": "embed_vectors",
                    "result": existing_result["result_data"],
                    "cached": True,
                    "processingMs": 0,
                }
            
            # Update share status
            update_share_status(UUID(shareId), "embedding")
            
            # Get embedder and process
            embedder = get_embedder()
            chunk_size = payload.get("chunkSize", 512)
            
            span.set_attribute("embedding.chunk_size", chunk_size)
            span.set_attribute("embedding.model", embedder.model)
            
            # Generate embeddings
            result = embedder.generate_embeddings(
                text=text,
                chunk_size=chunk_size,
            )
            
            # Calculate processing time
            processing_ms = int((time.time() - start_time) * 1000)
            
            # Save result to database
            save_ml_result(
                share_id=UUID(shareId),
                task_type="embed_vectors",
                result_data=result,
                model_version=result["model"],
                processing_ms=processing_ms,
            )
            
            # Store the average vector in the embeddings table
            _store_embedding_vector(shareId, result["average_vector"])
            
            # Update share status
            update_share_status(
                UUID(shareId),
                "embedded",
                metadata={
                    "has_embeddings": True,
                    "embedding_chunks": result["chunk_count"],
                    "embedding_dimensions": result["dimensions"],
                },
            )
            
            span.set_attribute("embedding.chunks", result.get("chunk_count", 0))
            span.set_attribute("embedding.total_tokens", result.get("total_tokens", 0))
            span.set_attribute("embedding.dimensions", result.get("dimensions", 0))
            span.set_status(trace.Status(trace.StatusCode.OK))
            
            return {
                "success": True,
                "shareId": shareId,
                "taskType": "embed_vectors",
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
                    "embedding_failed",
                    metadata={"error": str(e), "error_type": type(e).__name__},
                )
            except Exception:
                pass
            
            # Re-raise for Celery retry mechanism
            raise self.retry(exc=e, countdown=30 * (metadata.get("retryCount", 0) + 1))


def _store_embedding_vector(share_id: str, vector: list[float]) -> None:
    """Store embedding vector in the embeddings table."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            # Convert vector to PostgreSQL array format
            vector_str = f"[{','.join(map(str, vector))}]"
            
            cursor.execute(
                """
                INSERT INTO embeddings (share_id, embedding, created_at)
                VALUES (%s, %s::vector, NOW())
                ON CONFLICT (share_id) 
                DO UPDATE SET 
                    embedding = EXCLUDED.embedding,
                    created_at = EXCLUDED.created_at
                """,
                (share_id, vector_str),
            )