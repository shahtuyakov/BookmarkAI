"""Rate-limited transcription service using OpenAI Whisper API."""

import os
import logging
from typing import Dict, List, Any, Optional, Tuple
from openai import OpenAI
from pydantic import BaseModel, Field

from .transcription import (
    TranscriptionService,
    TranscriptionResult,
    TranscriptionSegment
)
from .rate_limited_client import RateLimitedWhisperClient, RateLimitError

logger = logging.getLogger(__name__)


class RateLimitedTranscriptionService(TranscriptionService):
    """Transcription service with integrated rate limiting."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the rate-limited transcription service.
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        # Initialize parent class
        super().__init__(api_key)
        
        # Check if rate limiting is enabled
        self.enable_rate_limiting = os.environ.get('ENABLE_WHISPER_RATE_LIMITING', 'true').lower() == 'true'
        
        # Initialize rate limited client if enabled
        self.rate_limited_client = None
        if self.enable_rate_limiting:
            try:
                self.rate_limited_client = RateLimitedWhisperClient(
                    enable_rate_limiting=True
                )
                logger.info("Initialized rate-limited Whisper client")
            except Exception as e:
                logger.error(f"Failed to initialize rate limiting: {e}")
                self.enable_rate_limiting = False
    
    def transcribe_api(
        self,
        audio_path: str,
        duration_seconds: float,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        identifier: Optional[str] = None
    ) -> TranscriptionResult:
        """Transcribe audio using OpenAI Whisper API with rate limiting.
        
        Args:
            audio_path: Path to audio file
            duration_seconds: Duration of audio in seconds
            language: Optional language code (e.g., 'en', 'es')
            prompt: Optional prompt to guide transcription
            identifier: Optional identifier for rate limiting (defaults to 'global')
            
        Returns:
            TranscriptionResult with transcription and metadata
            
        Raises:
            ValueError: If audio format not supported
            RateLimitError: If rate limited
            OpenAI.APIError: If API call fails
        """
        # Use rate limited client if available
        if self.enable_rate_limiting and self.rate_limited_client:
            return self._transcribe_with_rate_limit(
                audio_path, duration_seconds, language, prompt, identifier
            )
        else:
            # Fallback to parent implementation
            return super().transcribe_api(audio_path, duration_seconds, language, prompt)
    
    def _transcribe_with_rate_limit(
        self,
        audio_path: str,
        duration_seconds: float,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        identifier: Optional[str] = None
    ) -> TranscriptionResult:
        """Internal method to handle rate-limited transcription."""
        # Validate file format
        file_ext = os.path.splitext(audio_path)[1].lower()
        if file_ext not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported audio format: {file_ext}")
        
        # Use default identifier if not provided
        if not identifier:
            identifier = 'global'
        
        try:
            with open(audio_path, 'rb') as audio_file:
                logger.info(
                    f"Calling rate-limited Whisper API for {duration_seconds:.1f}s audio"
                    f"{f' in {language}' if language else ''}"
                )
                
                # Prepare API parameters
                api_params = {
                    "model": "whisper-1",
                    "response_format": "verbose_json",
                    "timestamp_granularities": ["segment"]
                }
                
                if language:
                    api_params["language"] = language
                    
                if prompt:
                    api_params["prompt"] = prompt
                
                # Call rate-limited API
                response = self.rate_limited_client.transcribe_sync(
                    audio_file=audio_file,
                    duration_seconds=duration_seconds,
                    identifier=identifier,
                    **api_params
                )
                
            # Calculate cost
            billing_usd = self._calculate_cost(duration_seconds)
            
            # Parse segments if available
            segments = []
            if hasattr(response, 'segments') and response.segments:
                for seg in response.segments:
                    # Handle both dict and object responses
                    if isinstance(seg, dict):
                        segments.append(TranscriptionSegment(
                            start=seg.get('start', 0.0),
                            end=seg.get('end', 0.0),
                            text=seg.get('text', '').strip()
                        ))
                    else:
                        # If it's an object with attributes
                        segments.append(TranscriptionSegment(
                            start=getattr(seg, 'start', 0.0),
                            end=getattr(seg, 'end', 0.0),
                            text=getattr(seg, 'text', '').strip()
                        ))
                logger.info(f"Parsed {len(segments)} segments from response")
            
            # Create result
            result = TranscriptionResult(
                text=response.text,
                segments=segments,
                language=response.language if hasattr(response, 'language') else language,
                duration_seconds=duration_seconds,
                billing_usd=billing_usd,
                backend="api"
            )
            
            logger.info(
                f"Rate-limited transcription completed: {len(result.text)} chars, "
                f"cost=${billing_usd:.4f}"
            )
            
            # Log queue depth if available
            if self.rate_limited_client:
                queue_info = self.rate_limited_client.get_queue_depth()
                logger.info(
                    f"Whisper queue depth: {queue_info['concurrent_requests']}/{queue_info['max_concurrent']} "
                    f"concurrent requests, {queue_info['active_keys']} active keys"
                )
            
            return result
            
        except RateLimitError as e:
            logger.warning(f"Rate limit hit for Whisper: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Transcription API error: {str(e)}")
            raise
    
    def merge_chunks(
        self,
        chunk_results: List[Tuple[TranscriptionResult, float]]
    ) -> TranscriptionResult:
        """Merge transcription results from multiple audio chunks.
        
        Uses parent implementation as merging logic doesn't change with rate limiting.
        """
        return super().merge_chunks(chunk_results)