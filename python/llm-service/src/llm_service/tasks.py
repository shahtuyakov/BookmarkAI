"""
LLM summarization tasks for BookmarkAI.
Implements the ml.summarize worker as specified in ADR-025.
"""
import os
import time
import logging
from typing import Dict, Any, Optional
from uuid import UUID
from celery import Task
from celery_singleton import Singleton
from .celery_app import app
from .llm_client import LLMClient, LLMProvider
from .rate_limited_client import RateLimitedLLMClient, RateLimitError as LLMRateLimitError
from .db import (
    save_summarization_result,
    track_llm_cost,
    check_budget_limits,
    BudgetExceededError
)
from .content_preflight import ContentPreflightService, ContentValidationError
from bookmarkai_shared.tracing import trace_celery_task
from opentelemetry import trace

logger = logging.getLogger(__name__)

# Import metrics functions
try:
    from bookmarkai_shared.metrics import (
        task_metrics,
        track_ml_cost,
        track_tokens,
        update_budget_remaining,
        track_budget_exceeded,
        track_model_latency
    )
    METRICS_ENABLED = True
except ImportError:
    logger.warning("Prometheus metrics not available")
    METRICS_ENABLED = False
    # Create no-op decorators and functions
    def task_metrics(worker_type):
        def decorator(func):
            return func
        return decorator
    def track_ml_cost(*args, **kwargs): pass
    def track_tokens(*args, **kwargs): pass
    def update_budget_remaining(*args, **kwargs): pass
    def track_budget_exceeded(*args, **kwargs): pass
    def track_model_latency(*args, **kwargs): pass

# Model pricing configuration (dollars per 1K tokens)
LLM_PRICING = {
    'openai': {
        'gpt-3.5-turbo': {'input': 0.0005, 'output': 0.0015},
        'gpt-3.5-turbo-16k': {'input': 0.003, 'output': 0.004},
        'gpt-4': {'input': 0.03, 'output': 0.06},
        'gpt-4-turbo': {'input': 0.01, 'output': 0.03},
        'gpt-4o': {'input': 0.005, 'output': 0.015},
        'gpt-4o-mini': {'input': 0.00015, 'output': 0.0006}
    },
    'anthropic': {
        'claude-3-opus-20240229': {'input': 0.015, 'output': 0.075},
        'claude-3-sonnet-20240229': {'input': 0.003, 'output': 0.015},
        'claude-3-haiku-20240307': {'input': 0.00025, 'output': 0.00125},
        'claude-2.1': {'input': 0.008, 'output': 0.024},
        'claude-instant-1.2': {'input': 0.00163, 'output': 0.00551}
    }
}


def calculate_cost(provider: str, model: str, tokens: Dict[str, int]) -> Dict[str, float]:
    """Calculate cost based on provider, model, and token usage."""
    pricing = LLM_PRICING.get(provider, {}).get(model, {})
    
    if not pricing:
        logger.warning(f"No pricing found for {provider}/{model}, using default")
        # Default to GPT-3.5 pricing as fallback
        pricing = {'input': 0.0005, 'output': 0.0015}
    
    input_cost = (tokens['input'] / 1000) * pricing['input']
    output_cost = (tokens['output'] / 1000) * pricing['output']
    
    return {
        'input_cost': round(input_cost, 6),
        'output_cost': round(output_cost, 6),
        'total_cost': round(input_cost + output_cost, 6)
    }


@app.task(
    name='llm_service.tasks.summarize_content',
    base=Singleton,
    lock_expiry=300,  # 5 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
@task_metrics(worker_type='llm')
@trace_celery_task('summarize_content')
def summarize_content(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Summarize content using LLM.
    
    Args:
        share_id: UUID of the share to process
        content: Content to summarize with keys:
            - text: The main text content
            - title: Optional title
            - url: Optional source URL
            - content_type: Type of content (article, video, etc.)
        options: Optional processing options:
            - provider: LLM provider to use (openai, anthropic)
            - model: Specific model to use
            - max_length: Maximum summary length
            - style: Summary style (brief, detailed, bullets)
    
    Returns:
        Dictionary with summary results
    """
    start_time = time.time()
    
    try:
        # Parse share_id
        share_uuid = UUID(share_id)
        
        # Extract content
        text_content = content.get('text', '')
        title = content.get('title', '')
        content_type = content.get('content_type', 'article')
        
        if not text_content:
            raise ValueError("No text content provided for summarization")
        
        # Validate content before processing
        preflight = ContentPreflightService()
        content_info = preflight.validate_content(
            text=text_content,
            content_type=content_type,
            check_language=False  # Skip language detection for now
        )
        
        if not content_info.is_valid:
            raise ContentValidationError(
                f"Content validation failed: {'; '.join(content_info.validation_errors)}"
            )
        
        logger.info(
            f"Content validated for share {share_id}: "
            f"{content_info.word_count} words, ~{content_info.estimated_tokens} tokens"
        )
        
        # Check if content needs truncation
        max_input_tokens = 4000  # Safe limit for most models
        if content_info.estimated_tokens > max_input_tokens:
            logger.warning(
                f"Content may be too long ({content_info.estimated_tokens} tokens), "
                f"considering truncation to {max_input_tokens} tokens"
            )
            text_content, was_truncated = preflight.truncate_to_limit(text_content, max_input_tokens)
            if was_truncated:
                logger.info(f"Content truncated to fit token limit")
        
        # Initialize LLM client with rate limiting
        provider = LLMProvider(options.get('provider', 'openai') if options else 'openai')
        
        # Check if rate limiting is enabled
        enable_rate_limiting = os.environ.get('ENABLE_LLM_RATE_LIMITING', 'true').lower() == 'true'
        
        if enable_rate_limiting and provider == LLMProvider.OPENAI:
            # Use rate-limited client for OpenAI
            llm_client = RateLimitedLLMClient(
                provider=provider,
                enable_rate_limiting=True
            )
            logger.info(f"Using rate-limited client for {provider.value}")
        else:
            # Use regular client
            llm_client = LLMClient(provider=provider)
            logger.info(f"Using regular client for {provider.value}")
        
        # Prepare prompt based on content type
        prompt = _build_summarization_prompt(
            text=text_content,
            title=title,
            content_type=content_type,
            style=options.get('style', 'brief') if options else 'brief'
        )
        
        # Get model configuration
        model = options.get('model') if options else None
        max_tokens = options.get('max_length', 500) if options else 500
        
        # Use preflight estimation if available, otherwise fall back to rough estimate
        estimated_input_tokens = content_info.estimated_tokens
        estimated_output_tokens = max_tokens
        estimated_tokens = {
            'input': estimated_input_tokens,
            'output': estimated_output_tokens,
            'total': estimated_input_tokens + estimated_output_tokens
        }
        
        # Calculate estimated cost
        model_name = model or ('gpt-3.5-turbo' if provider == LLMProvider.OPENAI else 'claude-3-sonnet-20240229')
        cost_estimate = calculate_cost(provider.value, model_name, estimated_tokens)
        
        # Check budget limits
        budget_check = check_budget_limits(cost_estimate['total_cost'])
        if not budget_check['allowed']:
            logger.warning(f"Budget limit would be exceeded for share {share_id}: {budget_check['reason']}")
            raise BudgetExceededError(budget_check['reason'])
        
        logger.info(
            f"Budget check passed for share {share_id}. "
            f"Estimated cost: ${cost_estimate['total_cost']:.4f}, "
            f"Current hourly: ${budget_check['current_hourly_cost']:.2f}/${budget_check['hourly_limit']:.2f}"
        )
        
        # Generate summary
        logger.info(f"Generating summary for share {share_id}")
        
        # Track model latency
        model_start = time.time()
        summary_result = llm_client.generate_summary(
            prompt=prompt,
            model=model,
            max_tokens=max_tokens
        )
        model_latency = time.time() - model_start
        
        # Track model latency metric
        if METRICS_ENABLED:
            track_model_latency(model_latency, summary_result['model'], 'summarization')
        
        # Calculate processing time
        processing_ms = int((time.time() - start_time) * 1000)
        
        # Calculate actual cost
        actual_tokens = summary_result.get('tokens_used', estimated_tokens)
        actual_cost = calculate_cost(provider.value, summary_result['model'], actual_tokens)
        
        # Add cost and token attributes to current span
        current_span = trace.get_current_span()
        if current_span:
            current_span.set_attribute("llm.cost.input_usd", actual_cost['input_cost'])
            current_span.set_attribute("llm.cost.output_usd", actual_cost['output_cost'])
            current_span.set_attribute("llm.cost.total_usd", actual_cost['total_cost'])
            current_span.set_attribute("llm.processing_time_ms", processing_ms)
        
        # Track cost in database
        track_llm_cost(
            share_id=share_id,
            model_name=summary_result['model'],
            provider=provider.value,
            input_tokens=actual_tokens['input'],
            output_tokens=actual_tokens['output'],
            input_cost_usd=actual_cost['input_cost'],
            output_cost_usd=actual_cost['output_cost'],
            backend='api',
            processing_time_ms=processing_ms
        )
        
        # Track metrics in Prometheus
        if METRICS_ENABLED:
            # Track cost metric
            track_ml_cost(actual_cost['total_cost'], 'summarization', summary_result['model'], 'llm')
            
            # Track token metrics
            track_tokens(actual_tokens['input'], 'summarization', summary_result['model'], 'input')
            track_tokens(actual_tokens['output'], 'summarization', summary_result['model'], 'output')
            track_tokens(actual_tokens['total'], 'summarization', summary_result['model'], 'total')
            
            # Update budget remaining (get from budget check result)
            if 'budget_check' in locals():
                update_budget_remaining(
                    budget_check['hourly_limit'] - budget_check['current_hourly_cost'],
                    'hourly',
                    'llm'
                )
                update_budget_remaining(
                    budget_check['daily_limit'] - budget_check['current_daily_cost'],
                    'daily',
                    'llm'
                )
        
        # Save to database
        logger.info(f"Saving summary result for share {share_id}")
        db_result = save_summarization_result(
            share_id=share_id,
            summary=summary_result['summary'],
            model=summary_result['model'],
            provider=provider.value,
            tokens_used=actual_tokens,
            processing_time_ms=processing_ms,
            metadata={
                'key_points': summary_result.get('key_points', []),
                'content_type': content_type,
                'word_count': len(text_content.split()),
                'summary_word_count': len(summary_result['summary'].split()),
                'cost_usd': actual_cost['total_cost']
            }
        )
        
        logger.info(
            f"Successfully summarized content for share {share_id} in {processing_ms}ms. "
            f"Tokens: {actual_tokens['total']}, Cost: ${actual_cost['total_cost']:.4f}"
        )
        
        return {
            'success': True,
            'share_id': share_id,
            'ml_result_id': db_result['id'],
            'summary': summary_result['summary'],
            'key_points': summary_result.get('key_points', []),
            'processing_ms': processing_ms,
            'tokens_used': actual_tokens,
            'cost_usd': actual_cost['total_cost']
        }
        
    except BudgetExceededError as e:
        # Track budget exceeded in metrics
        if METRICS_ENABLED:
            track_budget_exceeded('hourly' if 'hourly' in str(e) else 'daily', 'llm')
        # Re-raise budget errors without saving (they're expected)
        raise
        
    except ContentValidationError:
        # Re-raise validation errors without saving (they're expected)
        raise
        
    except LLMRateLimitError as e:
        # Handle rate limit errors - these should be retried
        logger.warning(f"Rate limit hit for share {share_id}: {e}")
        # Re-raise to trigger Celery retry with backoff
        retry_kwargs = {
            'countdown': getattr(e, 'retry_after', 60),  # Use retry_after from error
            'max_retries': 5,
        }
        raise self.retry(exc=e, **retry_kwargs)
        
    except Exception as e:
        logger.error(f"Failed to summarize content for share {share_id}: {e}")
        
        # Still try to save the error result
        try:
            processing_ms = int((time.time() - start_time) * 1000)
            save_summarization_result(
                share_id=share_id,
                summary='',
                model='unknown',
                provider=provider.value if 'provider' in locals() else 'unknown',
                tokens_used={'input': 0, 'output': 0, 'total': 0},
                processing_time_ms=processing_ms,
                metadata={
                    'error': str(e),
                    'status': 'failed'
                }
            )
        except Exception as save_error:
            logger.error(f"Failed to save error result: {save_error}")
        
        raise


def _build_summarization_prompt(
    text: str,
    title: str,
    content_type: str,
    style: str
) -> str:
    """Build appropriate prompt based on content type and style."""
    
    style_instructions = {
        'brief': "Provide a concise summary in 2-3 sentences.",
        'detailed': "Provide a comprehensive summary covering all main points.",
        'bullets': "Provide a summary with key points as bullet points.",
    }
    
    content_type_context = {
        'article': "article or blog post",
        'video': "video transcript",
        'tweet': "social media post",
        'reddit': "Reddit post or comment thread",
    }
    
    prompt = f"""Summarize the following {content_type_context.get(content_type, 'content')}.

Title: {title if title else 'Untitled'}

Content:
{text}

Instructions: {style_instructions.get(style, style_instructions['brief'])}
Focus on the main ideas, key insights, and actionable information.
"""
    
    return prompt


@app.task(
    name='llm_service.tasks.summarize_content_local',
    base=Singleton,
    lock_expiry=300,  # 5 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def summarize_content_local(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Summarize content using local LLM (placeholder for future implementation).
    
    This task will handle summarization using locally hosted LLMs like:
    - Ollama (with models like Llama, Mistral, etc.)
    - llama.cpp
    - Other self-hosted models
    
    Args:
        share_id: UUID of the share to process
        content: Content to summarize
        options: Processing options including model selection
    
    Returns:
        Dictionary with summary results
    """
    logger.info(f"Local summarization requested for share {share_id}")
    
    # TODO: Implement local LLM summarization
    # 1. Initialize local LLM client (Ollama/llama.cpp)
    # 2. Perform content validation
    # 3. Generate summary using local model
    # 4. Track resource usage (no cost, but track compute time)
    # 5. Save results to database
    
    raise NotImplementedError(
        "Local LLM summarization not yet implemented. "
        "This will support Ollama and other local models in a future update."
    )


@app.task(
    name='summarize_video_combined',
    base=Singleton,
    lock_expiry=600,  # 10 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
@task_metrics(worker_type='llm')
@trace_celery_task('summarize_video_combined')
def summarize_video_combined(
    self: Task,
    task_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Generate combined summary from video transcript, caption, and hashtags.
    Also generates a single high-quality embedding for the video.
    
    Args:
        task_data: Dictionary containing:
            - shareId: UUID of the share
            - payload: Dict with transcript, caption, hashtags, platform
            - options: Dict with generateEmbedding flag
    
    Returns:
        Dictionary with summary, embedding, and processing metadata
    """
    start_time = time.time()
    
    # Extract inputs
    share_id = task_data['shareId']
    payload = task_data['payload']
    options = task_data.get('options', {})
    
    transcript = payload.get('transcript', '')
    caption = payload.get('caption', '')
    hashtags = payload.get('hashtags', [])
    platform = payload.get('platform', 'unknown')
    
    logger.info(f"Processing combined video summary for share {share_id} from {platform}")
    
    try:
        # Initialize LLM client
        provider = LLMProvider.OPENAI  # Use OpenAI for combined summaries
        llm_client = LLMClient(provider=provider)
        
        # Build comprehensive prompt
        hashtag_text = ' '.join([f"#{tag}" for tag in hashtags]) if hashtags else ''
        
        prompt = f"""Analyze this {platform} video content:

Caption: {caption}
Hashtags: {hashtag_text}
Spoken Content (Transcript): {transcript}

Create a 2-3 sentence summary that:
1. Captures the main topic and key message
2. Integrates context from both written and spoken content
3. Uses natural language optimized for semantic search

Focus on what the video is about, not just what was said. Include relevant context from the caption and hashtags to provide a complete understanding."""

        # Estimate tokens for budget check
        estimated_tokens = llm_client.estimate_tokens(
            text=prompt,
            model='gpt-4o-mini'  # Use efficient model for summaries
        )
        
        # Check budget
        cost_estimate = calculate_cost(provider.value, 'gpt-4o-mini', estimated_tokens)
        budget_check = check_budget_limits(
            provider=provider.value,
            estimated_cost=cost_estimate['total_cost']
        )
        
        if not budget_check['within_limits']:
            if METRICS_ENABLED:
                track_budget_exceeded(budget_check['reason'], 'llm')
            raise BudgetExceededError(budget_check['reason'])
        
        # Generate summary
        model_start = time.time()
        summary_result = llm_client.generate_summary(
            prompt=prompt,
            model='gpt-4o-mini',
            max_tokens=200  # Concise summaries
        )
        model_latency = time.time() - model_start
        
        # Track model latency
        if METRICS_ENABLED:
            track_model_latency(model_latency, summary_result['model'], 'video_combined')
        
        # Generate embedding if requested
        embedding = None
        embedding_cost = {'total_cost': 0}
        
        if options.get('generateEmbedding', True):
            from vector_service.embedding_client import EmbeddingClient
            
            embedding_client = EmbeddingClient(provider='openai')
            embedding_result = embedding_client.generate_embedding(
                text=summary_result['summary'],
                model=options.get('embeddingModel', 'text-embedding-3-small')
            )
            
            embedding = embedding_result['embedding']
            # Track embedding cost (approx $0.00002 per 1K tokens for ada-002)
            embedding_tokens = len(summary_result['summary'].split()) * 1.3  # Rough estimate
            embedding_cost = {
                'total_cost': (embedding_tokens / 1000) * 0.00002
            }
        
        # Calculate total processing time
        processing_ms = int((time.time() - start_time) * 1000)
        
        # Calculate actual costs
        actual_tokens = summary_result.get('tokens_used', estimated_tokens)
        summary_cost = calculate_cost(provider.value, summary_result['model'], actual_tokens)
        total_cost = summary_cost['total_cost'] + embedding_cost['total_cost']
        
        # Track costs in database
        track_llm_cost(
            share_id=share_id,
            model_name=summary_result['model'],
            provider=provider.value,
            input_tokens=actual_tokens['input'],
            output_tokens=actual_tokens['output'],
            input_cost_usd=summary_cost['input_cost'],
            output_cost_usd=summary_cost['output_cost'],
            backend='api',
            processing_time_ms=processing_ms
        )
        
        # Track metrics
        if METRICS_ENABLED:
            track_ml_cost(total_cost, 'video_combined', summary_result['model'], 'llm')
            track_tokens(actual_tokens['total'], 'video_combined', summary_result['model'], 'total')
        
        # Save combined result to database
        from .db import save_ml_result
        
        db_result = save_ml_result(
            share_id=share_id,
            task_type='summarize_video_combined',
            result_data={
                'summary': summary_result['summary'],
                'embedding': embedding,
                'has_embedding': embedding is not None,
                'transcript_length': len(transcript),
                'caption_length': len(caption),
                'hashtag_count': len(hashtags)
            },
            model_version=f"{summary_result['model']}_video_combined_v1",
            processing_time_ms=processing_ms
        )
        
        logger.info(
            f"Successfully created combined summary for share {share_id} in {processing_ms}ms. "
            f"Cost: ${total_cost:.6f}"
        )
        
        return {
            'success': True,
            'share_id': share_id,
            'ml_result_id': db_result['id'],
            'summary': summary_result['summary'],
            'embedding': embedding,
            'processing_ms': processing_ms,
            'tokens_used': actual_tokens,
            'cost_usd': total_cost,
            'task_type': 'summarize_video_combined'
        }
        
    except BudgetExceededError:
        raise  # Re-raise budget errors
    except ContentValidationError as e:
        logger.warning(f"Content validation failed for share {share_id}: {e}")
        return {
            'success': False,
            'share_id': share_id,
            'error': str(e),
            'error_type': 'validation_error'
        }
    except Exception as e:
        logger.error(f"Error in combined video summary for share {share_id}: {e}", exc_info=True)
        return {
            'success': False,
            'share_id': share_id,
            'error': str(e),
            'error_type': 'processing_error'
        }