"""Whisper transcription Celery tasks."""

import os
import logging
import time
from typing import Dict, Any, Optional
from celery import Task
from celery_singleton import Singleton
from celery.exceptions import SoftTimeLimitExceeded

from .celery_app import app
from .audio_processor import AudioProcessor
from .transcription import TranscriptionService, TranscriptionResult
from .db import save_transcription_result, track_transcription_cost, check_budget_limits
from .media_preflight import MediaPreflightService

logger = logging.getLogger(__name__)

# Import rate-limited transcription service
try:
    from .transcription_rate_limited import RateLimitedTranscriptionService
    from .rate_limited_client import RateLimitError
    RATE_LIMITING_AVAILABLE = True
except ImportError:
    logger.warning("Rate limiting not available for Whisper service")
    RATE_LIMITING_AVAILABLE = False
    RateLimitedTranscriptionService = TranscriptionService  # Fallback
    RateLimitError = Exception  # Fallback

# Import metrics functions
try:
    from bookmarkai_shared.metrics import (
        task_metrics,
        track_ml_cost,
        track_audio_duration,
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
    def track_audio_duration(*args, **kwargs): pass
    def update_budget_remaining(*args, **kwargs): pass
    def track_budget_exceeded(*args, **kwargs): pass
    def track_model_latency(*args, **kwargs): pass


class TranscriptionError(Exception):
    """Custom exception for transcription failures."""
    pass


class BudgetExceededError(Exception):
    """Exception raised when transcription would exceed budget limits."""
    pass


@app.task(
    name='whisper.tasks.transcribe_api',
    base=Singleton,
    lock_expiry=900,  # 15 minutes
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
    autoretry_for=(Exception,),
    retry_kwargs={'max_retries': 3, 'countdown': 60}
)
@task_metrics(worker_type='whisper')
def transcribe_api(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Transcribe media using OpenAI Whisper API.
    
    Args:
        self: Celery task instance
        share_id: Unique identifier for the share
        content: Dictionary containing mediaUrl
        options: Optional settings (language, prompt, etc.)
        
    Returns:
        Dictionary with transcription results
        
    Raises:
        TranscriptionError: If transcription fails
        ValueError: If required parameters missing
    """
    start_time = time.time()
    logger.info(f"Starting API transcription for share_id: {share_id}")
    
    # Validate inputs
    media_url = content.get('mediaUrl')
    if not media_url:
        raise ValueError("No mediaUrl provided in content")
    
    # Initialize services
    audio_processor = AudioProcessor()
    
    # Use rate-limited service if available and enabled
    enable_rate_limiting = os.environ.get('ENABLE_WHISPER_RATE_LIMITING', 'true').lower() == 'true'
    if enable_rate_limiting and RATE_LIMITING_AVAILABLE:
        transcription_service = RateLimitedTranscriptionService()
    else:
        transcription_service = TranscriptionService()
    
    preflight_service = MediaPreflightService()
    
    # Pre-flight validation
    logger.info(f"Running pre-flight checks for {media_url}")
    preflight_result = preflight_service.check_media_eligibility(
        media_url,
        max_duration=MediaPreflightService.MAX_DURATION_SECONDS,
        max_cost=10.0  # Hard limit per single transcription
    )
    
    if not preflight_result['eligible']:
        logger.warning(
            f"Media failed pre-flight checks for share_id {share_id}: "
            f"{preflight_result['reason']}"
        )
        raise TranscriptionError(f"Pre-flight validation failed: {preflight_result['reason']}")
    
    # Log any warnings
    if preflight_result['warnings']:
        logger.warning(
            f"Pre-flight warnings for share_id {share_id}: "
            f"{', '.join(preflight_result['warnings'])}"
        )
    
    # Use preflight metadata if available, otherwise use content metadata
    preflight_metadata = preflight_result.get('metadata', {})
    estimated_duration = (
        preflight_metadata.get('duration_seconds') or 
        content.get('duration', 300)  # Default 5 minutes if unknown
    )
    estimated_cost = (estimated_duration / 60.0) * TranscriptionService.COST_PER_MINUTE
    
    # Check budget limits before processing
    budget_check = check_budget_limits(estimated_cost)
    if not budget_check['allowed']:
        logger.warning(
            f"Transcription rejected due to budget limits for share_id {share_id}: "
            f"{budget_check['reason']}"
        )
        raise BudgetExceededError(
            f"Budget limit exceeded: {budget_check['reason']}. "
            f"Current hourly: ${budget_check['current_hourly_cost']:.2f}/${budget_check['hourly_limit']:.2f}, "
            f"Daily: ${budget_check['current_daily_cost']:.2f}/${budget_check['daily_limit']:.2f}"
        )
    
    logger.info(
        f"Budget check passed - Hourly: ${budget_check['current_hourly_cost']:.2f}/${budget_check['hourly_limit']:.2f}, "
        f"Daily: ${budget_check['current_daily_cost']:.2f}/${budget_check['daily_limit']:.2f}"
    )
    
    # Track all temporary files for cleanup
    temp_files = []
    
    try:
        # Phase 1: Download media
        logger.info(f"Downloading media from: {media_url}")
        video_path = audio_processor.download_media(media_url)
        
        # Only add to temp_files if it's a downloaded file, not a local file
        if not os.path.isfile(media_url):
            temp_files.append(video_path)
        
        # Validate downloaded file
        local_validation = preflight_service.validate_local_file(video_path)
        if not local_validation['valid']:
            raise TranscriptionError(
                f"Downloaded file validation failed: {local_validation['reason']}"
            )
        
        # Phase 2: Extract and normalize audio
        logger.info("Extracting audio from video")
        audio_path, duration, file_size_mb = audio_processor.extract_audio(
            video_path,
            apply_normalization=options.get('normalize', True) if options else True
        )
        temp_files.append(audio_path)
        
        logger.info(
            f"Audio extracted: duration={duration:.1f}s, size={file_size_mb:.2f}MB"
        )
        
        # Recalculate cost with actual duration and check budget again
        actual_cost = (duration / 60.0) * TranscriptionService.COST_PER_MINUTE
        if actual_cost > estimated_cost * 1.5:  # If actual cost is significantly higher
            budget_recheck = check_budget_limits(actual_cost)
            if not budget_recheck['allowed']:
                logger.warning(
                    f"Transcription rejected after duration check for share_id {share_id}: "
                    f"Actual duration {duration:.1f}s would cost ${actual_cost:.4f}"
                )
                raise BudgetExceededError(
                    f"Budget limit exceeded with actual duration: {budget_recheck['reason']}. "
                    f"Estimated: ${estimated_cost:.4f}, Actual: ${actual_cost:.4f}"
                )
        
        # Phase 3: Validate audio
        validation = audio_processor.validate_audio(audio_path)
        if not validation['valid']:
            raise TranscriptionError(f"Audio validation failed: {validation['reason']}")
        
        # Phase 3.5: Check for silence (optional based on configuration)
        if options and options.get('skip_silent', True):
            logger.info("Checking for silent audio")
            silence_check = audio_processor.detect_silence(
                audio_path,
                silence_threshold_db=float(os.getenv('WHISPER_SILENCE_THRESHOLD_DB', '-40.0'))
            )
            
            if silence_check['is_silent']:
                logger.warning(
                    f"Audio appears to be silent for share_id {share_id}: "
                    f"{silence_check['reason']}"
                )
                
                # Save a minimal result indicating silence
                silence_result = TranscriptionResult(
                    text="[Audio appears to be silent or extremely quiet]",
                    segments=[],
                    language="unknown",
                    duration_seconds=duration,
                    billing_usd=0.0,  # No charge for silent audio
                    backend="skipped"
                )
                
                db_result = save_transcription_result(
                    share_id, 
                    silence_result,
                    metadata={'skipped_reason': 'silent_audio', **silence_check}
                )
                
                return {
                    'share_id': share_id,
                    'success': True,
                    'result': db_result,
                    'skipped': True,
                    'skip_reason': silence_check['reason'],
                    'metrics': {
                        'processing_time_seconds': time.time() - start_time,
                        'audio_duration_seconds': duration,
                        'mean_volume_db': silence_check.get('mean_volume'),
                        'max_volume_db': silence_check.get('max_volume')
                    }
                }
        
        # Phase 4: Check if chunking needed
        needs_chunking = (
            file_size_mb > AudioProcessor.MAX_FILE_SIZE_MB or 
            duration > AudioProcessor.CHUNK_DURATION_SECONDS
        )
        
        if needs_chunking:
            logger.info("Audio requires chunking for API limits")
            
            # Chunk the audio
            chunks = audio_processor.chunk_audio(audio_path, duration)
            temp_files.extend([chunk[0] for chunk in chunks])
            
            # Transcribe each chunk
            chunk_results = []
            for i, (chunk_path, start, end) in enumerate(chunks):
                logger.info(f"Transcribing chunk {i+1}/{len(chunks)}: {start:.1f}s - {end:.1f}s")
                
                # Check for soft timeout
                try:
                    # Add identifier for rate limiting if supported
                    transcribe_kwargs = {
                        'audio_path': chunk_path,
                        'duration_seconds': end - start,
                        'language': options.get('language') if options else None,
                        'prompt': options.get('prompt') if options else None
                    }
                    if hasattr(transcription_service, 'transcribe_api') and 'identifier' in transcription_service.transcribe_api.__code__.co_varnames:
                        transcribe_kwargs['identifier'] = share_id
                    
                    chunk_result = transcription_service.transcribe_api(**transcribe_kwargs)
                    chunk_results.append((chunk_result, start))
                    
                except SoftTimeLimitExceeded:
                    logger.error("Soft time limit exceeded during chunk transcription")
                    # Try to save partial results if we have any
                    if chunk_results:
                        final_result = transcription_service.merge_chunks(chunk_results)
                        _save_partial_result(share_id, final_result, "partial_timeout")
                    raise
                
            # Merge all chunk results
            final_result = transcription_service.merge_chunks(chunk_results)
            
        else:
            # Single transcription for short audio
            logger.info("Transcribing complete audio file")
            
            # Track model latency
            model_start = time.time()
            # Add identifier for rate limiting if supported
            transcribe_kwargs = {
                'audio_path': audio_path,
                'duration_seconds': duration,
                'language': options.get('language') if options else None,
                'prompt': options.get('prompt') if options else None
            }
            if hasattr(transcription_service, 'transcribe_api') and 'identifier' in transcription_service.transcribe_api.__code__.co_varnames:
                transcribe_kwargs['identifier'] = share_id
            
            final_result = transcription_service.transcribe_api(**transcribe_kwargs)
            model_latency = time.time() - model_start
            
            # Track model latency metric
            if METRICS_ENABLED:
                track_model_latency(model_latency, 'whisper-api', 'transcription')
        
        # Phase 5: Save results to database
        logger.info("Saving transcription results to database")
        db_result = save_transcription_result(share_id, final_result)
        
        # Track costs separately for analytics
        track_transcription_cost(
            share_id,
            final_result.duration_seconds,
            final_result.billing_usd,
            final_result.backend
        )
        
        # Track metrics in Prometheus
        if METRICS_ENABLED:
            # Track cost metric
            track_ml_cost(final_result.billing_usd, 'transcription', 'whisper-api', 'whisper')
            
            # Track audio duration
            track_audio_duration(final_result.duration_seconds, 'transcription', 'whisper-api')
            
            # Update budget remaining (get from budget check result)
            if 'budget_check' in locals():
                update_budget_remaining(
                    budget_check['hourly_limit'] - budget_check['current_hourly_cost'],
                    'hourly',
                    'whisper'
                )
                update_budget_remaining(
                    budget_check['daily_limit'] - budget_check['current_daily_cost'],
                    'daily',
                    'whisper'
                )
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Log queue depth if using rate limited service
        queue_info = {}
        try:
            if isinstance(transcription_service, RateLimitedTranscriptionService) and hasattr(transcription_service, 'rate_limited_client') and transcription_service.rate_limited_client:
                queue_info = transcription_service.rate_limited_client.get_queue_depth()
                logger.info(
                    f"Whisper queue depth: {queue_info['concurrent_requests']}/{queue_info['max_concurrent']} "
                    f"concurrent requests, {queue_info['active_keys']} active keys"
                )
        except Exception as e:
            logger.debug(f"Could not get queue depth: {e}")
            
            # Track queue depth metrics if available
            if METRICS_ENABLED:
                try:
                    from bookmarkai_shared.metrics import service_queue_depth
                    service_queue_depth.labels(
                        service='whisper',
                        queue_type='concurrent_requests'
                    ).set(queue_info['concurrent_requests'])
                except ImportError:
                    pass
        
        logger.info(
            f"Transcription completed successfully: "
            f"share_id={share_id}, "
            f"duration={final_result.duration_seconds:.1f}s, "
            f"cost=${final_result.billing_usd:.4f}, "
            f"processing_time={processing_time:.1f}s"
        )
        
        return {
            'share_id': share_id,
            'success': True,
            'result': db_result,
            'metrics': {
                'processing_time_seconds': processing_time,
                'audio_duration_seconds': final_result.duration_seconds,
                'chunks_processed': len(chunks) if needs_chunking else 1,
                'total_cost_usd': final_result.billing_usd
            }
        }
        
    except SoftTimeLimitExceeded:
        logger.error(f"Task soft time limit exceeded for share_id: {share_id}")
        raise
        
    except BudgetExceededError as e:
        # Track budget exceeded in metrics
        if METRICS_ENABLED:
            track_budget_exceeded('hourly' if 'hourly' in str(e) else 'daily', 'whisper')
        # Re-raise budget errors
        raise
        
    except RateLimitError as e:
        logger.warning(f"Rate limit hit for share_id {share_id}: {str(e)}")
        # Re-raise for retry logic with appropriate delay
        raise
        
    except Exception as e:
        logger.error(
            f"Transcription failed for share_id {share_id}: {str(e)}",
            exc_info=True
        )
        
        # On final retry failure, save error state
        if self.request.retries >= self.max_retries:
            _save_error_state(share_id, str(e))
        
        raise TranscriptionError(f"Transcription failed: {str(e)}")
        
    finally:
        # Always cleanup temporary files
        logger.info("Cleaning up temporary files")
        audio_processor.cleanup(temp_files)


@app.task(
    name='whisper.tasks.transcribe_local',
    base=Singleton,
    lock_expiry=900,
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
@task_metrics(worker_type='whisper')
def transcribe_local(
    self: Task,
    share_id: str,
    content: Dict[str, Any],
    options: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Placeholder for local GPU transcription.
    
    This task will be implemented when GPU infrastructure is available.
    For now, it raises NotImplementedError.
    """
    logger.warning(
        f"Local transcription requested for share_id {share_id} but not implemented. "
        "Falling back to API transcription."
    )
    
    # Fallback to API transcription
    return transcribe_api.apply(args=[share_id, content, options]).get()


def _save_partial_result(share_id: str, result: TranscriptionResult, status: str):
    """Save partial transcription result for timeout scenarios."""
    try:
        logger.warning(f"Saving partial result for share_id {share_id}: {status}")
        save_transcription_result(share_id, result, metadata={'status': status})
    except Exception as e:
        logger.error(f"Failed to save partial result: {e}")


def _save_error_state(share_id: str, error_message: str):
    """Save error state to database for failed transcriptions."""
    try:
        logger.error(f"Saving error state for share_id {share_id}: {error_message}")
        # This would save to a separate error tracking table
        # Implementation depends on your error tracking strategy
    except Exception as e:
        logger.error(f"Failed to save error state: {e}")