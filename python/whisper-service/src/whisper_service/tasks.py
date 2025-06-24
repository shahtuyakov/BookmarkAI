"""Whisper transcription Celery tasks."""

import logging
import time
from typing import Dict, Any, Optional
from celery import Task
from celery_singleton import Singleton
from celery.exceptions import SoftTimeLimitExceeded

from .celery_app import app
from .audio_processor import AudioProcessor
from .transcription import TranscriptionService, TranscriptionResult
from .db import save_transcription_result, track_transcription_cost

logger = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Custom exception for transcription failures."""
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
    transcription_service = TranscriptionService()
    
    # Track all temporary files for cleanup
    temp_files = []
    
    try:
        # Phase 1: Download media
        logger.info(f"Downloading media from: {media_url}")
        video_path = audio_processor.download_media(media_url)
        temp_files.append(video_path)
        
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
        
        # Phase 3: Validate audio
        validation = audio_processor.validate_audio(audio_path)
        if not validation['valid']:
            raise TranscriptionError(f"Audio validation failed: {validation['reason']}")
        
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
                    chunk_result = transcription_service.transcribe_api(
                        chunk_path,
                        end - start,
                        language=options.get('language') if options else None,
                        prompt=options.get('prompt') if options else None
                    )
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
            final_result = transcription_service.transcribe_api(
                audio_path,
                duration,
                language=options.get('language') if options else None,
                prompt=options.get('prompt') if options else None
            )
        
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
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
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