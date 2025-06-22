"""Whisper transcription logic."""

import os
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.parse import urlparse

import whisper
import torch
import ffmpeg
from common.utils import download_media, get_s3_client, measure_time
from common.config import settings


class WhisperTranscriber:
    """Handles audio transcription using OpenAI Whisper."""
    
    def __init__(self, model_size: str = "base"):
        """Initialize the Whisper model.
        
        Args:
            model_size: Size of the Whisper model to use.
                       Options: tiny, base, small, medium, large
        """
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = whisper.load_model(model_size, device=self.device)
        self.model_size = model_size
        
    @measure_time
    def transcribe_from_url(
        self,
        media_url: str,
        language: Optional[str] = None,
        task: str = "transcribe",
    ) -> Dict[str, Any]:
        """Transcribe audio from URL.
        
        Args:
            media_url: URL of the media file (HTTP or S3)
            language: Language code (e.g., 'en', 'es') or None for auto-detection
            task: Either 'transcribe' or 'translate' (to English)
            
        Returns:
            Transcription result with text, segments, and metadata
        """
        # Download media to temporary file
        with tempfile.NamedTemporaryFile(suffix=self._get_file_extension(media_url)) as tmp_file:
            # Download based on URL type
            if media_url.startswith("s3://"):
                self._download_from_s3(media_url, tmp_file.name)
            else:
                # HTTP/HTTPS download
                import httpx
                response = httpx.get(media_url, timeout=300, follow_redirects=True)
                response.raise_for_status()
                tmp_file.write(response.content)
                tmp_file.flush()
            
            # Extract audio if needed
            audio_file = self._extract_audio(tmp_file.name)
            
            try:
                # Transcribe with Whisper
                result = self.model.transcribe(
                    audio_file,
                    language=language,
                    task=task,
                    fp16=self.device == "cuda",  # Use FP16 on GPU
                    verbose=False,
                )
                
                # Format the result
                return self._format_result(result)
            finally:
                # Clean up extracted audio if different from original
                if audio_file != tmp_file.name and os.path.exists(audio_file):
                    os.unlink(audio_file)
    
    def _get_file_extension(self, url: str) -> str:
        """Extract file extension from URL."""
        parsed = urlparse(url)
        path = Path(parsed.path)
        return path.suffix or ".mp4"
    
    def _download_from_s3(self, s3_url: str, output_path: str) -> None:
        """Download file from S3."""
        # Parse S3 URL: s3://bucket/key
        parts = s3_url.replace("s3://", "").split("/", 1)
        bucket = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        
        s3_client = get_s3_client()
        s3_client.download_file(bucket, key, output_path)
    
    def _extract_audio(self, input_file: str) -> str:
        """Extract audio from video file if needed."""
        # Check if file is already audio-only
        probe = ffmpeg.probe(input_file)
        streams = probe.get("streams", [])
        
        has_video = any(s["codec_type"] == "video" for s in streams)
        has_audio = any(s["codec_type"] == "audio" for s in streams)
        
        if not has_audio:
            raise ValueError("No audio stream found in media file")
        
        # If it's already audio-only, return as-is
        if not has_video:
            return input_file
        
        # Extract audio to temporary file
        output_file = input_file + "_audio.wav"
        
        try:
            (
                ffmpeg
                .input(input_file)
                .output(
                    output_file,
                    acodec="pcm_s16le",
                    ar=16000,  # Whisper prefers 16kHz
                    ac=1,      # Mono
                    format="wav",
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True)
            )
            return output_file
        except ffmpeg.Error as e:
            raise RuntimeError(f"Failed to extract audio: {e.stderr.decode()}")
    
    def _format_result(self, raw_result: Dict[str, Any]) -> Dict[str, Any]:
        """Format Whisper result for storage."""
        # Extract segments with timestamps
        segments = []
        for segment in raw_result.get("segments", []):
            segments.append({
                "id": segment["id"],
                "start": segment["start"],
                "end": segment["end"],
                "text": segment["text"].strip(),
                "confidence": segment.get("avg_logprob", 0),
            })
        
        return {
            "text": raw_result["text"],
            "language": raw_result.get("language", "unknown"),
            "duration": raw_result.get("segments", [{}])[-1].get("end", 0) if raw_result.get("segments") else 0,
            "segments": segments,
            "model": f"whisper-{self.model_size}",
        }