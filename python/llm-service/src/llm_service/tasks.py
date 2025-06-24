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
from bookmarkai_shared.models import save_ml_result

logger = logging.getLogger(__name__)


@app.task(
    name='llm_service.tasks.summarize_content',
    base=Singleton,
    lock_expiry=300,  # 5 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
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
        
        # Initialize LLM client
        provider = LLMProvider(options.get('provider', 'openai') if options else 'openai')
        llm_client = LLMClient(provider=provider)
        
        # Prepare prompt based on content type
        prompt = _build_summarization_prompt(
            text=text_content,
            title=title,
            content_type=content_type,
            style=options.get('style', 'brief') if options else 'brief'
        )
        
        # Generate summary
        logger.info(f"Generating summary for share {share_id}")
        summary_result = llm_client.generate_summary(
            prompt=prompt,
            model=options.get('model') if options else None,
            max_tokens=options.get('max_length', 500) if options else 500
        )
        
        # Calculate processing time
        processing_ms = int((time.time() - start_time) * 1000)
        
        # Prepare result data
        result_data = {
            'summary': summary_result['summary'],
            'key_points': summary_result.get('key_points', []),
            'content_type': content_type,
            'word_count': len(text_content.split()),
            'summary_word_count': len(summary_result['summary'].split()),
            'provider': provider.value,
            'model': summary_result['model'],
            'processing_ms': processing_ms,
        }
        
        # Save to database
        logger.info(f"Saving summary result for share {share_id}")
        ml_result = save_ml_result(
            share_id=share_uuid,
            task_type='summarize_llm',
            result_data=result_data,
            model_version=summary_result['model'],
            processing_ms=processing_ms
        )
        
        logger.info(
            f"Successfully summarized content for share {share_id} in {processing_ms}ms"
        )
        
        return {
            'success': True,
            'share_id': share_id,
            'ml_result_id': str(ml_result.id),
            'summary': summary_result['summary'],
            'key_points': summary_result.get('key_points', []),
            'processing_ms': processing_ms,
        }
        
    except Exception as e:
        logger.error(f"Failed to summarize content for share {share_id}: {e}")
        
        # Still try to save the error result
        try:
            save_ml_result(
                share_id=UUID(share_id),
                task_type='summarize_llm',
                result_data={
                    'error': str(e),
                    'status': 'failed'
                },
                processing_ms=int((time.time() - start_time) * 1000)
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