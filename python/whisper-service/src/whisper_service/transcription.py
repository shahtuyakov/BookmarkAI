"""Transcription service using OpenAI Whisper API."""

import os
import logging
from typing import Dict, List, Any, Optional, Tuple
from openai import OpenAI
from pydantic import BaseModel, Field
from opentelemetry import trace
from opentelemetry.trace import Status, StatusCode

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


class TranscriptionSegment(BaseModel):
    """Individual transcription segment with timing."""
    start: float = Field(..., description="Start time in seconds")
    end: float = Field(..., description="End time in seconds")
    text: str = Field(..., description="Transcribed text")


class TranscriptionResult(BaseModel):
    """Complete transcription result with metadata."""
    text: str = Field(..., description="Full transcription text")
    segments: List[TranscriptionSegment] = Field(default_factory=list)
    language: Optional[str] = Field(None, description="Detected language code")
    duration_seconds: float = Field(..., description="Audio duration in seconds")
    billing_usd: float = Field(..., description="Cost in USD")
    backend: str = Field(default="api", description="Backend used (api/local)")
    
    class Config:
        json_encoders = {
            float: lambda v: round(v, 4)  # Round floats to 4 decimal places
        }


class TranscriptionService:
    """Service for transcribing audio using OpenAI Whisper API."""
    
    # OpenAI Whisper API pricing per minute
    COST_PER_MINUTE = 0.006
    
    # Supported audio formats
    SUPPORTED_FORMATS = {'.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'}
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the transcription service.
        
        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OpenAI API key not provided")
        
        self.client = OpenAI(api_key=self.api_key)
        logger.info("Initialized OpenAI client for transcription")
    
    def transcribe_api(
        self,
        audio_path: str,
        duration_seconds: float,
        language: Optional[str] = None,
        prompt: Optional[str] = None
    ) -> TranscriptionResult:
        """Transcribe audio using OpenAI Whisper API.
        
        Args:
            audio_path: Path to audio file
            duration_seconds: Duration of audio in seconds
            language: Optional language code (e.g., 'en', 'es')
            prompt: Optional prompt to guide transcription
            
        Returns:
            TranscriptionResult with transcription and metadata
            
        Raises:
            ValueError: If audio format not supported
            OpenAI.APIError: If API call fails
        """
        # Validate file format
        file_ext = os.path.splitext(audio_path)[1].lower()
        if file_ext not in self.SUPPORTED_FORMATS:
            raise ValueError(f"Unsupported audio format: {file_ext}")
        
        # Create span for transcription
        with tracer.start_as_current_span(
            "whisper.transcribe_api",
            kind=trace.SpanKind.CLIENT
        ) as span:
            # Set span attributes
            span.set_attribute("whisper.audio_duration", duration_seconds)
            span.set_attribute("whisper.audio_format", file_ext)
            if language:
                span.set_attribute("whisper.language", language)
            span.set_attribute("whisper.model", "whisper-1")
            
            try:
                with open(audio_path, 'rb') as audio_file:
                    logger.info(
                        f"Calling OpenAI Whisper API for {duration_seconds:.1f}s audio"
                        f"{f' in {language}' if language else ''}"
                    )
                    
                    # Prepare API parameters
                    api_params = {
                        "model": "whisper-1",
                        "file": audio_file,
                        "response_format": "verbose_json",
                        "timestamp_granularities": ["segment"]
                    }
                    
                    if language:
                        api_params["language"] = language
                        
                    if prompt:
                        api_params["prompt"] = prompt
                    
                    # Call API
                    response = self.client.audio.transcriptions.create(**api_params)
                
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
                
                # Add response attributes to span
                span.set_attribute("whisper.transcript_length", len(result.text))
                span.set_attribute("whisper.segments_count", len(segments))
                span.set_attribute("whisper.detected_language", result.language)
                span.set_attribute("whisper.cost_usd", billing_usd)
                
                # Set success status
                span.set_status(Status(StatusCode.OK))
                
                logger.info(
                    f"Transcription completed: {len(result.text)} chars, "
                    f"cost=${billing_usd:.4f}"
                )
                
                return result
                
            except Exception as e:
                logger.error(f"Transcription API error: {str(e)}")
                # Record exception in span
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
    
    def transcribe_local(
        self,
        audio_path: str,
        duration_seconds: float,
        language: Optional[str] = None
    ) -> TranscriptionResult:
        """Placeholder for local GPU transcription.
        
        This will be implemented when GPU infrastructure is available.
        """
        raise NotImplementedError(
            "Local GPU transcription not yet implemented. "
            "Use transcribe_api for now."
        )
    
    def merge_chunks(
        self,
        chunk_results: List[Tuple[TranscriptionResult, float]]
    ) -> TranscriptionResult:
        """Merge transcription results from multiple audio chunks.
        
        Args:
            chunk_results: List of (TranscriptionResult, start_offset) tuples
            
        Returns:
            Merged TranscriptionResult
        """
        if not chunk_results:
            raise ValueError("No chunk results to merge")
        
        # Collect all text parts
        text_parts = []
        all_segments = []
        total_cost = 0.0
        total_duration = 0.0
        
        # Use language from first chunk
        language = chunk_results[0][0].language
        
        for result, offset in chunk_results:
            # Add text
            text_parts.append(result.text.strip())
            
            # Add to totals
            total_cost += result.billing_usd
            total_duration = max(total_duration, offset + result.duration_seconds)
            
            # Adjust segment timestamps and add
            for segment in result.segments:
                adjusted_segment = TranscriptionSegment(
                    start=segment.start + offset,
                    end=segment.end + offset,
                    text=segment.text
                )
                all_segments.append(adjusted_segment)
        
        # Join text parts with space
        full_text = ' '.join(text_parts)
        
        # Sort segments by start time
        all_segments.sort(key=lambda s: s.start)
        
        logger.info(
            f"Merged {len(chunk_results)} chunks: "
            f"{len(all_segments)} segments, {total_duration:.1f}s total"
        )
        
        return TranscriptionResult(
            text=full_text,
            segments=all_segments,
            language=language,
            duration_seconds=total_duration,
            billing_usd=total_cost,
            backend="api"
        )
    
    def _calculate_cost(self, duration_seconds: float) -> float:
        """Calculate transcription cost in USD.
        
        Args:
            duration_seconds: Audio duration in seconds
            
        Returns:
            Cost in USD
        """
        duration_minutes = duration_seconds / 60.0
        cost = duration_minutes * self.COST_PER_MINUTE
        return round(cost, 6)  # Round to 6 decimal places for precision
    
    def estimate_cost(self, duration_seconds: float) -> Dict[str, float]:
        """Estimate transcription cost with breakdown.
        
        Args:
            duration_seconds: Audio duration in seconds
            
        Returns:
            Dictionary with cost breakdown
        """
        cost_usd = self._calculate_cost(duration_seconds)
        
        return {
            'duration_seconds': duration_seconds,
            'duration_minutes': duration_seconds / 60.0,
            'cost_per_minute': self.COST_PER_MINUTE,
            'total_cost_usd': cost_usd,
            'total_cost_cents': cost_usd * 100
        }