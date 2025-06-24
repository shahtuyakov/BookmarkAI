"""Audio processing utilities for Whisper service."""

import os
import tempfile
import logging
from typing import Tuple, List, Optional
from urllib.parse import urlparse
import requests
import ffmpeg

logger = logging.getLogger(__name__)


class AudioProcessor:
    """Handles audio extraction, normalization, and chunking for transcription."""
    
    MAX_FILE_SIZE_MB = 20  # Conservative limit below API's 25MB
    TARGET_SAMPLE_RATE = 16000
    TARGET_BITRATE = '128k'
    CHUNK_DURATION_SECONDS = 600  # 10 minutes per chunk
    
    def __init__(self):
        self.temp_files: List[str] = []
    
    def download_media(self, media_url: str) -> str:
        """Download media file to temporary location.
        
        Args:
            media_url: URL of the media file (HTTP/HTTPS or S3)
            
        Returns:
            Path to downloaded file
            
        Raises:
            ValueError: If URL scheme is not supported
            requests.HTTPError: If download fails
        """
        parsed_url = urlparse(media_url)
        
        # Create temp file with appropriate extension
        suffix = self._get_file_extension(media_url)
        temp_file = tempfile.NamedTemporaryFile(
            delete=False, 
            suffix=suffix,
            prefix='whisper_download_'
        )
        self.temp_files.append(temp_file.name)
        
        try:
            if parsed_url.scheme in ('http', 'https'):
                logger.info(f"Downloading media from HTTP: {media_url}")
                response = requests.get(media_url, stream=True, timeout=60)
                response.raise_for_status()
                
                # Download in chunks to handle large files
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        temp_file.write(chunk)
                        
            elif parsed_url.scheme == 's3':
                # TODO: Implement S3 download with boto3
                raise NotImplementedError("S3 download not yet implemented")
            else:
                raise ValueError(f"Unsupported URL scheme: {parsed_url.scheme}")
            
            temp_file.close()
            logger.info(f"Downloaded media to: {temp_file.name}")
            return temp_file.name
            
        except Exception:
            # Clean up on failure
            temp_file.close()
            if os.path.exists(temp_file.name):
                os.unlink(temp_file.name)
                self.temp_files.remove(temp_file.name)
            raise
    
    def extract_audio(self, video_path: str, apply_normalization: bool = True) -> Tuple[str, float, float]:
        """Extract and normalize audio from video file.
        
        Args:
            video_path: Path to video file
            apply_normalization: Whether to apply loudness normalization
            
        Returns:
            Tuple of (audio_path, duration_seconds, file_size_mb)
            
        Raises:
            ffmpeg.Error: If extraction fails
        """
        audio_path = video_path.replace(os.path.splitext(video_path)[1], '_audio.m4a')
        self.temp_files.append(audio_path)
        
        try:
            # Get media info first
            probe = ffmpeg.probe(video_path)
            video_stream = next(
                (stream for stream in probe['streams'] if stream['codec_type'] == 'video'),
                None
            )
            audio_stream = next(
                (stream for stream in probe['streams'] if stream['codec_type'] == 'audio'),
                None
            )
            
            # Get duration (prefer from audio stream if available)
            if audio_stream and 'duration' in audio_stream:
                duration = float(audio_stream['duration'])
            elif video_stream and 'duration' in video_stream:
                duration = float(video_stream['duration'])
            elif 'format' in probe and 'duration' in probe['format']:
                duration = float(probe['format']['duration'])
            else:
                raise ValueError("Could not determine media duration")
            
            logger.info(f"Media duration: {duration:.2f} seconds")
            
            # Build ffmpeg command
            stream = ffmpeg.input(video_path)
            
            # Audio extraction with optimization
            audio = stream.audio
            
            # Apply audio filters
            if apply_normalization:
                # Loudness normalization using EBU R128 standard
                audio = ffmpeg.filter(audio, 'loudnorm', I=-16, TP=-1.5, LRA=11)
                logger.info("Applying loudness normalization")
            
            # Output settings for size optimization
            audio = ffmpeg.output(
                audio,
                audio_path,
                acodec='aac',  # AAC codec for compatibility
                audio_bitrate=self.TARGET_BITRATE,
                ar=self.TARGET_SAMPLE_RATE,  # 16kHz sample rate
                ac=1,  # Mono audio
                movflags='faststart'  # Optimize for streaming
            )
            
            # Run extraction
            ffmpeg.run(audio, overwrite_output=True, quiet=True, capture_stderr=True)
            
            # Check resulting file size
            file_size_mb = os.path.getsize(audio_path) / (1024 * 1024)
            logger.info(f"Extracted audio: {audio_path}, size: {file_size_mb:.2f}MB")
            
            return audio_path, duration, file_size_mb
            
        except ffmpeg.Error as e:
            logger.error(f"FFmpeg error: {e.stderr.decode() if e.stderr else str(e)}")
            raise
        except Exception:
            # Clean up on failure
            if os.path.exists(audio_path):
                os.unlink(audio_path)
                self.temp_files.remove(audio_path)
            raise
    
    def chunk_audio(self, audio_path: str, duration: float) -> List[Tuple[str, float, float]]:
        """Split audio into chunks for API limits.
        
        Args:
            audio_path: Path to audio file
            duration: Total duration in seconds
            
        Returns:
            List of tuples (chunk_path, start_time, end_time)
        """
        chunks = []
        
        # If duration is within single chunk limit, return as-is
        if duration <= self.CHUNK_DURATION_SECONDS:
            logger.info("Audio duration within single chunk limit")
            return [(audio_path, 0.0, duration)]
        
        logger.info(f"Chunking audio into {self.CHUNK_DURATION_SECONDS}s segments")
        
        # Calculate number of chunks needed
        num_chunks = int((duration + self.CHUNK_DURATION_SECONDS - 1) / self.CHUNK_DURATION_SECONDS)
        
        for i in range(num_chunks):
            start_time = i * self.CHUNK_DURATION_SECONDS
            end_time = min((i + 1) * self.CHUNK_DURATION_SECONDS, duration)
            chunk_duration = end_time - start_time
            
            # Create chunk filename
            chunk_path = audio_path.replace('.m4a', f'_chunk{i:03d}.m4a')
            self.temp_files.append(chunk_path)
            
            try:
                # Extract chunk using ffmpeg
                stream = ffmpeg.input(audio_path, ss=start_time, t=chunk_duration)
                stream = ffmpeg.output(
                    stream, 
                    chunk_path,
                    acodec='copy',  # Copy codec to avoid re-encoding
                    movflags='faststart'
                )
                ffmpeg.run(stream, overwrite_output=True, quiet=True)
                
                # Verify chunk was created
                if not os.path.exists(chunk_path):
                    raise RuntimeError(f"Failed to create chunk: {chunk_path}")
                
                chunk_size_mb = os.path.getsize(chunk_path) / (1024 * 1024)
                logger.info(
                    f"Created chunk {i}: {start_time:.1f}s-{end_time:.1f}s, "
                    f"size: {chunk_size_mb:.2f}MB"
                )
                
                chunks.append((chunk_path, start_time, end_time))
                
            except Exception as e:
                logger.error(f"Failed to create chunk {i}: {e}")
                raise
        
        return chunks
    
    def validate_audio(self, audio_path: str) -> dict:
        """Validate audio file properties.
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            Dictionary with validation results
        """
        try:
            probe = ffmpeg.probe(audio_path)
            audio_stream = next(
                (stream for stream in probe['streams'] if stream['codec_type'] == 'audio'),
                None
            )
            
            if not audio_stream:
                return {
                    'valid': False,
                    'reason': 'No audio stream found'
                }
            
            # Extract properties
            duration = float(audio_stream.get('duration', 0))
            bitrate = int(audio_stream.get('bit_rate', 0))
            sample_rate = int(audio_stream.get('sample_rate', 0))
            
            # Basic validation
            if duration < 0.1:
                return {
                    'valid': False,
                    'reason': 'Audio duration too short'
                }
            
            return {
                'valid': True,
                'duration': duration,
                'bitrate': bitrate,
                'sample_rate': sample_rate,
                'codec': audio_stream.get('codec_name', 'unknown')
            }
            
        except Exception as e:
            return {
                'valid': False,
                'reason': f'Validation error: {str(e)}'
            }
    
    def cleanup(self, additional_files: Optional[List[str]] = None):
        """Clean up all temporary files.
        
        Args:
            additional_files: Additional files to clean up
        """
        all_files = self.temp_files.copy()
        if additional_files:
            all_files.extend(additional_files)
        
        for file_path in all_files:
            try:
                if os.path.exists(file_path):
                    os.unlink(file_path)
                    logger.debug(f"Cleaned up: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up {file_path}: {e}")
        
        self.temp_files.clear()
    
    def _get_file_extension(self, url: str) -> str:
        """Extract file extension from URL."""
        path = urlparse(url).path
        extension = os.path.splitext(path)[1]
        
        # Default to .mp4 if no extension found
        if not extension:
            extension = '.mp4'
            
        return extension