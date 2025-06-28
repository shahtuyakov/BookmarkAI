"""Audio processing utilities for Whisper service."""

import os
import tempfile
import logging
from typing import Tuple, List, Optional
from urllib.parse import urlparse
import requests
import ffmpeg
import boto3
from botocore.exceptions import ClientError

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
        """Download media file or handle local file path.
        
        Args:
            media_url: URL of the media file (HTTP/HTTPS or S3) or local file path
            
        Returns:
            Path to downloaded file or original local file
            
        Raises:
            ValueError: If URL scheme is not supported
            requests.HTTPError: If download fails
            FileNotFoundError: If local file doesn't exist
        """
        # Check if it's a local file path
        if os.path.isfile(media_url):
            logger.info(f"Using local file: {media_url}")
            # Verify the file exists and is readable
            if not os.access(media_url, os.R_OK):
                raise ValueError(f"Local file is not readable: {media_url}")
            return media_url
        
        # Check if it's an absolute path that doesn't exist
        if os.path.isabs(media_url):
            raise FileNotFoundError(f"Local file not found: {media_url}")
        
        # Parse as URL
        parsed_url = urlparse(media_url)
        if not parsed_url.scheme:
            raise ValueError(f"Invalid URL or file path: {media_url}")
        
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
                # Download from S3
                bucket_name = parsed_url.netloc
                key = parsed_url.path.lstrip('/')
                
                logger.info(f"Downloading from S3: bucket={bucket_name}, key={key}")
                
                try:
                    # Configure S3 client for MinIO or AWS
                    s3_config = {
                        'region_name': os.environ.get('AWS_REGION', 'us-east-1')
                    }
                    
                    # Check if we're using MinIO (custom endpoint)
                    s3_endpoint = os.environ.get('S3_ENDPOINT')
                    if s3_endpoint:
                        logger.info(f"Using custom S3 endpoint: {s3_endpoint}")
                        s3_config['endpoint_url'] = s3_endpoint
                        s3_config['use_ssl'] = not s3_endpoint.startswith('http://')
                        
                        # Use explicit credentials for MinIO
                        access_key = os.environ.get('S3_ACCESS_KEY') or os.environ.get('AWS_ACCESS_KEY_ID')
                        secret_key = os.environ.get('S3_SECRET_KEY') or os.environ.get('AWS_SECRET_ACCESS_KEY')
                        
                        if access_key and secret_key:
                            s3_config['aws_access_key_id'] = access_key
                            s3_config['aws_secret_access_key'] = secret_key
                    
                    s3_client = boto3.client('s3', **s3_config)
                    s3_client.download_file(bucket_name, key, temp_file.name)
                    logger.info(f"Successfully downloaded from S3 to: {temp_file.name}")
                except ClientError as e:
                    error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                    if error_code == 'NoSuchKey':
                        raise ValueError(f"S3 object not found: {media_url}")
                    elif error_code == 'AccessDenied':
                        raise ValueError(f"Access denied to S3 object: {media_url}")
                    else:
                        raise Exception(f"S3 download failed: {str(e)}")
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
    
    def detect_silence(self, audio_path: str, silence_threshold_db: float = -40.0) -> dict:
        """Detect if audio is mostly silence.
        
        Uses ffmpeg to analyze audio levels and determine if the content
        is predominantly silent, which would waste transcription costs.
        
        Args:
            audio_path: Path to audio file
            silence_threshold_db: Threshold in dB below which audio is considered silent
            
        Returns:
            Dictionary with silence detection results:
                - is_silent: bool - Whether audio is predominantly silent
                - mean_volume: float - Mean volume in dB
                - max_volume: float - Maximum volume in dB
                - silence_ratio: float - Ratio of silent segments (0-1)
                - reason: str - Explanation if audio is considered silent
        """
        try:
            # Use ffmpeg to analyze audio statistics
            stats = ffmpeg.probe(audio_path, 
                cmd='ffprobe',
                select_streams='a:0',
                show_entries='frame_tags=lavfi.astats.Overall.Mean_volume,'
                           'lavfi.astats.Overall.Max_volume',
                v='quiet',
                af='astats'
            )
            
            # Alternative approach using volumedetect filter
            logger.info(f"Analyzing audio levels for silence detection")
            
            # Run volumedetect filter
            process = (
                ffmpeg
                .input(audio_path)
                .filter('volumedetect')
                .output('-', format='null')
                .run_async(pipe_stderr=True, quiet=True)
            )
            
            _, stderr = process.communicate()
            output = stderr.decode('utf-8')
            
            # Parse volumedetect output
            mean_volume = None
            max_volume = None
            
            for line in output.split('\n'):
                if 'mean_volume:' in line:
                    mean_volume = float(line.split('mean_volume:')[1].split('dB')[0].strip())
                elif 'max_volume:' in line:
                    max_volume = float(line.split('max_volume:')[1].split('dB')[0].strip())
            
            if mean_volume is None or max_volume is None:
                logger.warning("Could not extract volume statistics")
                return {
                    'is_silent': False,
                    'mean_volume': None,
                    'max_volume': None,
                    'silence_ratio': None,
                    'reason': 'Unable to analyze audio levels'
                }
            
            # Check if audio is too quiet
            is_silent = mean_volume < silence_threshold_db
            
            # Additional check: if max volume is also very low
            is_very_quiet = max_volume < (silence_threshold_db + 10)
            
            result = {
                'is_silent': is_silent,
                'mean_volume': mean_volume,
                'max_volume': max_volume,
                'silence_ratio': None,  # Could be calculated with more sophisticated analysis
                'reason': None
            }
            
            if is_silent:
                if is_very_quiet:
                    result['reason'] = f'Audio is nearly silent (mean: {mean_volume:.1f}dB, max: {max_volume:.1f}dB)'
                else:
                    result['reason'] = f'Audio is too quiet on average (mean: {mean_volume:.1f}dB)'
            
            logger.info(
                f"Silence detection complete: mean={mean_volume:.1f}dB, "
                f"max={max_volume:.1f}dB, is_silent={is_silent}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Silence detection failed: {str(e)}")
            return {
                'is_silent': False,
                'mean_volume': None,
                'max_volume': None,
                'silence_ratio': None,
                'reason': f'Silence detection error: {str(e)}'
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