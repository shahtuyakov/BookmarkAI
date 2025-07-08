"""
Celery tasks for vector embedding generation.
Implements singleton pattern to prevent duplicate processing.
"""

import os
import time
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

from celery import Task
from celery_singleton import Singleton
from pydantic import ValidationError

from .celery_app import app
from .embedding_service import EmbeddingService, EmbeddingRequest, EmbeddingType
from .chunking_strategies import ChunkingService, ChunkingConfig
from .content_preprocessor import ContentPreprocessor
from .models import (
    EmbeddingTask,
    EmbeddingResult,
    ContentType,
    ChunkStrategy,
    ContentChunk
)
from .db import BudgetExceededError
from bookmarkai_shared.metrics import (
    task_metrics,
    track_ml_cost,
    track_tokens
)
from .metrics import (
    embeddings_generated_total,
    embedding_chunks_total,
    embedding_model_usage,
    embedding_latency_seconds,
    batch_embeddings_total,
    chunks_per_document,
    chunk_size_tokens,
    embeddings_skipped_total,
    vector_cost_by_model,
    update_budget_metrics
)
from bookmarkai_shared.tracing import trace_celery_task
from opentelemetry import trace

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)

# Import rate-limited embedding service
try:
    from .embedding_service_rate_limited import RateLimitedEmbeddingService
    from .rate_limited_client import RateLimitError
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    logger.warning("Rate limiting not available for embeddings service")
    RATE_LIMITING_AVAILABLE = False
    RateLimitedEmbeddingService = EmbeddingService  # Fallback
    RateLimitError = Exception  # Fallback

# Initialize services
embedding_service = None
chunking_service = None
preprocessor = None


def get_services():
    """Lazy initialization of services."""
    global embedding_service, chunking_service, preprocessor
    
    if embedding_service is None:
        # Use rate-limited service if available and enabled
        enable_rate_limiting = os.environ.get('ENABLE_EMBEDDINGS_RATE_LIMITING', 'true').lower() == 'true'
        if enable_rate_limiting and RATE_LIMITING_AVAILABLE:
            embedding_service = RateLimitedEmbeddingService()
            logger.info("Initialized RateLimitedEmbeddingService")
        else:
            embedding_service = EmbeddingService()
            logger.info("Initialized EmbeddingService")
    
    if chunking_service is None:
        chunking_service = ChunkingService()
        logger.info("Initialized ChunkingService")
    
    if preprocessor is None:
        preprocessor = ContentPreprocessor()
        logger.info("Initialized ContentPreprocessor")
    
    return embedding_service, chunking_service, preprocessor


@app.task(
    name='vector_service.tasks.generate_embeddings',
    base=Singleton,
    lock_expiry=600,  # 10 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=300,  # 5 minutes soft limit
    time_limit=600,  # 10 minutes hard limit
    max_retries=3,
    default_retry_delay=60,
)
@task_metrics(worker_type='vector')
@trace_celery_task('generate_embeddings')
def generate_embeddings(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate embeddings for content with intelligent chunking.
    
    Args:
        self: Celery task instance
        share_id: Unique identifier for the share
        content: Content dictionary with text, type, and metadata
        options: Optional processing options
        
    Returns:
        Dictionary with embedding results
    """
    start_time = time.time()
    total_cost = 0.0
    
    try:
        # Validate input
        try:
            task = EmbeddingTask(
                share_id=share_id,
                content=content,
                options=options or {}
            )
        except ValidationError as e:
            logger.error(f"Invalid task format: {e}")
            raise ValueError(f"Invalid task format: {str(e)}")
        
        # Initialize services
        embed_service, chunk_service, preprocess = get_services()
        
        # Extract content and metadata
        text = content.get('text', '')
        content_type = ContentType(content.get('type', 'caption'))
        metadata = content.get('metadata', {})
        
        # Get options
        embedding_type = EmbeddingType(
            options.get('embedding_type', EmbeddingType.CONTENT.value)
        )
        force_model = options.get('force_model')
        chunk_strategy = options.get('chunk_strategy')
        
        logger.info(
            f"Processing {content_type} content for share {share_id} "
            f"(embedding_type: {embedding_type}, length: {len(text)} chars)"
        )
        
        # Preprocess content
        processed_text, extracted_metadata = preprocess.preprocess(
            text, content_type, metadata
        )
        
        # Check if content should be skipped
        should_skip, skip_reason = preprocess.should_skip_embedding(
            processed_text, content_type
        )
        if should_skip:
            logger.warning(f"Skipping embedding for share {share_id}: {skip_reason}")
            # Track skipped embeddings
            embeddings_skipped_total.labels(
                reason=skip_reason,
                content_type=content_type.value
            ).inc()
            return {
                'share_id': share_id,
                'status': 'skipped',
                'reason': skip_reason,
                'processing_time_ms': int((time.time() - start_time) * 1000)
            }
        
        # Update metadata with extracted info
        metadata.update(extracted_metadata)
        
        # Estimate costs before proceeding
        estimated_tokens = embed_service.count_tokens(processed_text, embed_service.default_model)
        model = embed_service.select_model(processed_text, force_model)
        estimated_cost = embed_service.estimate_cost(estimated_tokens, model)
        
        # Check budget limits
        from .db import check_budget_limits
        within_budget, budget_error = check_budget_limits(estimated_cost, estimated_tokens)
        if not within_budget:
            logger.error(f"Budget check failed for share {share_id}: {budget_error}")
            raise BudgetExceededError(budget_error)
        
        # Determine chunking configuration
        chunk_config = ChunkingConfig()
        if chunk_strategy:
            chunk_config.strategy = ChunkStrategy(chunk_strategy)
        
        # Chunk content if needed
        chunks = chunk_service.chunk_content(
            processed_text,
            share_id,
            content_type,
            chunk_config,
            metadata,
            force_strategy=chunk_config.strategy if chunk_strategy else None
        )
        
        logger.info(f"Created {len(chunks)} chunks for embedding")
        
        # Track chunking metrics
        chunks_per_document.labels(
            content_type=content_type.value
        ).observe(len(chunks))
        
        # Track chunk sizes
        for chunk in chunks:
            chunk_size_tokens.labels(
                content_type=content_type.value,
                chunk_strategy=chunk_config.strategy.value
            ).observe(chunk.token_count)
        
        # Generate embeddings for each chunk
        embeddings = []
        total_tokens = 0
        
        # Process in batches if many chunks
        batch_size = int(os.getenv('VECTOR_BATCH_SIZE', '100'))
        
        for i in range(0, len(chunks), batch_size):
            batch_chunks = chunks[i:i + batch_size]
            
            if len(batch_chunks) == 1:
                # Single chunk - use regular embedding
                chunk = batch_chunks[0]
                request = EmbeddingRequest(
                    text=chunk.text,
                    embedding_type=embedding_type,
                    force_model=force_model
                )
                
                # Add identifier for rate limiting if supported
                if hasattr(embed_service, 'generate_embedding'):
                    # Check if the method accepts identifier parameter
                    import inspect
                    sig = inspect.signature(embed_service.generate_embedding)
                    if 'identifier' in sig.parameters:
                        response = embed_service.generate_embedding(request, identifier=share_id)
                    else:
                        response = embed_service.generate_embedding(request)
                else:
                    response = embed_service.generate_embedding(request)
                
                embeddings.append({
                    'embedding': response.embedding,
                    'metadata': chunk.metadata.model_dump(),
                    'model': response.model,
                    'dimensions': response.dimensions,
                    'token_count': response.token_count
                })
                
                total_tokens += response.token_count
                total_cost += response.cost
                
            else:
                # Multiple chunks - use batch embedding
                texts = [chunk.text for chunk in batch_chunks]
                
                from .embedding_service import EmbeddingBatch
                batch = EmbeddingBatch(
                    texts=texts,
                    embedding_type=embedding_type,
                    force_model=force_model
                )
                
                # Add identifier for rate limiting if supported
                if hasattr(embed_service, 'generate_batch_embeddings'):
                    # Check if the method accepts identifier parameter
                    import inspect
                    sig = inspect.signature(embed_service.generate_batch_embeddings)
                    if 'identifier' in sig.parameters:
                        batch_response = embed_service.generate_batch_embeddings(batch, identifier=share_id)
                    else:
                        batch_response = embed_service.generate_batch_embeddings(batch)
                else:
                    batch_response = embed_service.generate_batch_embeddings(batch)
                
                for j, (embedding, chunk) in enumerate(zip(batch_response.embeddings, batch_chunks)):
                    embeddings.append({
                        'embedding': embedding,
                        'metadata': chunk.metadata.model_dump(),
                        'model': batch_response.model,
                        'dimensions': batch_response.dimensions,
                        'token_count': chunk.token_count  # Use pre-calculated
                    })
                
                total_tokens += batch_response.total_tokens
                total_cost += batch_response.total_cost
        
        # Track metrics
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Track embeddings generated
        embeddings_generated_total.labels(
            content_type=content_type.value,
            embedding_type=embedding_type.value,
            model=embeddings[0]['model'] if embeddings else 'unknown'
        ).inc(len(embeddings))
        
        # Track chunks
        embedding_chunks_total.labels(
            content_type=content_type.value,
            chunk_strategy=chunk_config.strategy.value
        ).inc(len(chunks))
        
        # Add cost and result attributes to current span
        current_span = trace.get_current_span()
        if current_span:
            current_span.set_attribute("embeddings.total_cost", total_cost)
            current_span.set_attribute("embeddings.total_tokens", total_tokens)
            current_span.set_attribute("embeddings.chunk_count", len(chunks))
            current_span.set_attribute("embeddings.model", embeddings[0]['model'] if embeddings else 'unknown')
        
        # Track cost
        model = embeddings[0]['model'] if embeddings else 'unknown'
        track_ml_cost(total_cost, 'embedding', model, 'vector')
        track_tokens(total_tokens, 'embedding', model)
        
        # Track model usage
        if embeddings:
            model_used = embeddings[0]['model']
            embedding_model_usage.labels(model=model_used).inc(len(embeddings))
            
            # Track cost by model
            vector_cost_by_model.labels(model=model_used).inc(total_cost)
        
        # Track latency
        embedding_latency_seconds.labels(
            content_type=content_type.value
        ).observe(processing_time_ms / 1000.0)
        
        # Update budget metrics
        update_budget_metrics()
        
        # Create result
        result = EmbeddingResult(
            share_id=share_id,
            embeddings=embeddings,
            model=embeddings[0]['model'] if embeddings else 'unknown',
            total_tokens=total_tokens,
            total_cost=total_cost,
            processing_time_ms=processing_time_ms
        )
        
        logger.info(
            f"Successfully generated {len(embeddings)} embeddings for share {share_id} "
            f"({total_tokens} tokens, ${total_cost:.6f}, {processing_time_ms}ms)"
        )
        
        # Save to database
        try:
            from .db import save_embedding_result
            save_embedding_result(result, share_id, metadata)
        except Exception as e:
            logger.error(f"Failed to save embeddings to database: {e}")
            # Don't fail the task if DB save fails
        
        return result.model_dump()
        
    except RateLimitError as e:
        logger.warning(f"Rate limit hit for share_id {share_id}: {str(e)}")
        # Track rate limit in metrics
        from bookmarkai_shared.metrics import task_errors
        
        task_errors.labels(
            task_name='generate_embeddings',
            error_type='RateLimitError',
            worker_type='vector'
        ).inc()
        
        # Re-raise for retry logic with appropriate delay
        raise
        
    except Exception as e:
        logger.error(f"Failed to generate embeddings for share {share_id}: {str(e)}")
        
        # Track error using shared metrics
        from bookmarkai_shared.metrics import task_errors, budget_exceeded_total
        
        task_errors.labels(
            task_name='generate_embeddings',
            error_type=type(e).__name__,
            worker_type='vector'
        ).inc()
        
        # Track budget exceeded separately
        if isinstance(e, BudgetExceededError):
            budget_exceeded_total.labels(
                budget_type='cost',
                service='vector'
            ).inc()
            # Don't retry budget exceeded errors
            raise
        
        # Retry if applicable (for other errors)
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying task (attempt {self.request.retries + 1}/{self.max_retries})")
            raise self.retry(exc=e, countdown=60 * (self.request.retries + 1))
        
        raise


@app.task(
    name='vector_service.tasks.generate_embeddings_batch',
    base=Singleton,
    lock_expiry=1800,  # 30 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
    soft_time_limit=1200,  # 20 minutes soft limit
    time_limit=1800,  # 30 minutes hard limit
)
@task_metrics(worker_type='vector')
@trace_celery_task('generate_embeddings_batch')
def generate_embeddings_batch(
    self: Task,
    tasks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generate embeddings for multiple shares in batch.
    Optimized for cost efficiency during off-peak processing.
    
    Args:
        self: Celery task instance
        tasks: List of embedding tasks
        
    Returns:
        Dictionary with batch results
    """
    start_time = time.time()
    results = []
    total_cost = 0.0
    total_tokens = 0
    succeeded = 0
    failed = 0
    
    logger.info(f"Processing batch of {len(tasks)} embedding tasks")
    
    try:
        # Process each task
        for task_data in tasks:
            try:
                result = generate_embeddings(
                    task_data['share_id'],
                    task_data['content'],
                    task_data.get('options')
                )
                
                results.append(result)
                if result.get('status') != 'skipped':
                    total_cost += result.get('total_cost', 0)
                    total_tokens += result.get('total_tokens', 0)
                succeeded += 1
                
            except Exception as e:
                logger.error(f"Failed to process task {task_data.get('share_id')}: {e}")
                results.append({
                    'share_id': task_data.get('share_id'),
                    'status': 'failed',
                    'error': str(e)
                })
                failed += 1
        
        processing_time_ms = int((time.time() - start_time) * 1000)
        
        # Track batch metrics
        batch_embeddings_total.labels(status='success').inc(succeeded)
        batch_embeddings_total.labels(status='failed').inc(failed)
        
        # Track batch processing duration
        from .metrics import batch_processing_duration
        batch_processing_duration.observe(processing_time_ms / 1000.0)
        
        logger.info(
            f"Batch processing complete: {succeeded} succeeded, {failed} failed "
            f"({total_tokens} tokens, ${total_cost:.6f}, {processing_time_ms}ms)"
        )
        
        return {
            'total_tasks': len(tasks),
            'succeeded': succeeded,
            'failed': failed,
            'total_cost': total_cost,
            'total_tokens': total_tokens,
            'processing_time_ms': processing_time_ms,
            'results': results
        }
        
    except Exception as e:
        logger.error(f"Batch processing failed: {e}")
        raise


@app.task(
    name='vector_service.tasks.generate_embeddings_local',
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def generate_embeddings_local(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Generate embeddings using local models (future implementation).
    Placeholder for GPU-based local embedding generation.
    
    Args:
        self: Celery task instance
        share_id: Unique identifier for the share
        content: Content dictionary
        options: Optional processing options
        
    Returns:
        Dictionary with embedding results
    """
    logger.warning(
        f"Local embedding generation not implemented yet for share {share_id}. "
        "Falling back to API-based generation."
    )
    
    # For now, redirect to API-based generation
    return generate_embeddings(self, share_id, content, options)


# Health check task
@app.task(name='vector_service.tasks.health_check')
def health_check() -> Dict[str, Any]:
    """Health check task for monitoring."""
    try:
        # Check if services can be initialized
        embed_service, chunk_service, preprocess = get_services()
        
        # Simple token count test
        test_text = "Health check"
        token_count = embed_service.count_tokens(test_text, embed_service.default_model)
        
        return {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'services': {
                'embedding_service': 'ready',
                'chunking_service': 'ready',
                'preprocessor': 'ready'
            },
            'test_token_count': token_count
        }
    except Exception as e:
        return {
            'status': 'unhealthy',
            'timestamp': datetime.utcnow().isoformat(),
            'error': str(e)
        }