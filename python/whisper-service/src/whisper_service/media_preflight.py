"""Media pre-flight validation service.

This module provides early validation of media files before expensive
processing operations like transcription.
"""

import os
import re
import logging
import subprocess
from typing import Dict, Any, Optional, Tuple
from urllib.parse import urlparse
import requests

logger = logging.getLogger(__name__)


class MediaPreflightService:
    """Service for pre-flight media validation."""
    
    # Maximum allowed duration in seconds (30 minutes)
    MAX_DURATION_SECONDS = 1800
    
    # Maximum file size for direct download check (in MB)
    MAX_PREFLIGHT_SIZE_MB = 5
    
    # Supported media formats
    SUPPORTED_FORMATS = {
        '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm',
        '.aac', '.flac', '.ogg', '.opus', '.avi', '.mov', '.mkv'
    }
    
    # URL patterns that indicate media content
    MEDIA_URL_PATTERNS = [
        r'\.mp4(\?|$)', r'\.mp3(\?|$)', r'\.wav(\?|$)', r'\.m4a(\?|$)',
        r'\.webm(\?|$)', r'\.aac(\?|$)', r'\.ogg(\?|$)', r'\.opus(\?|$)',
        r'/video/', r'/audio/', r'/media/', r'tiktok\.com', r'youtube\.com',
        r'vimeo\.com', r'soundcloud\.com', r'spotify\.com'
    ]
    
    def __init__(self):
        """Initialize the preflight service."""
        self._check_ffprobe()
    
    def _check_ffprobe(self):
        """Check if ffprobe is available."""
        try:
            subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
            self.has_ffprobe = True
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.warning("ffprobe not found, some preflight checks will be limited")
            self.has_ffprobe = False
    
    def validate_url(self, url: str) -> Dict[str, Any]:
        """Validate media URL before download.
        
        Args:
            url: URL to validate
            
        Returns:
            Dictionary with validation results:
                - valid: bool - Whether URL appears valid
                - reason: str - Reason if invalid
                - warnings: List[str] - Non-fatal warnings
                - metadata: Dict - Any extracted metadata
        """
        result = {
            'valid': True,
            'reason': None,
            'warnings': [],
            'metadata': {}
        }
        
        # Check if it's a local file path first
        if os.path.isfile(url):
            # Validate local file
            try:
                if not os.access(url, os.R_OK):
                    result['valid'] = False
                    result['reason'] = f"Local file is not readable: {url}"
                    return result
                
                # Get file metadata
                file_stats = os.stat(url)
                size_mb = file_stats.st_size / (1024 * 1024)
                result['metadata']['size_mb'] = round(size_mb, 2)
                result['metadata']['is_local_file'] = True
                
                # Try to get media duration using ffprobe
                try:
                    probe_result = self._probe_media(url)
                    if probe_result and 'duration_seconds' in probe_result:
                        result['metadata']['duration_seconds'] = probe_result['duration_seconds']
                        result['metadata'].update(probe_result)
                except Exception as e:
                    result['warnings'].append(f"Could not probe media file: {str(e)}")
                
                # Local file validation complete - return early
                return result
                
            except Exception as e:
                result['valid'] = False
                result['reason'] = f"Error accessing local file: {str(e)}"
                return result
        
        # Basic URL validation for remote URLs only
        try:
            parsed = urlparse(url)
            if not parsed.scheme in ['http', 'https', 's3']:
                result['valid'] = False
                result['reason'] = f"Unsupported URL scheme: {parsed.scheme}"
                return result
        except Exception as e:
            result['valid'] = False
            result['reason'] = f"Invalid URL: {str(e)}"
            return result
        
        # Special handling for S3 URLs
        if parsed.scheme == 's3':
            # S3 URLs are in format s3://bucket/key
            if not parsed.netloc:
                result['valid'] = False
                result['reason'] = "Invalid S3 URL: missing bucket name"
                return result
            
            result['metadata']['is_s3_url'] = True
            result['metadata']['s3_bucket'] = parsed.netloc
            result['metadata']['s3_key'] = parsed.path.lstrip('/')
            # Skip HEAD request for S3 URLs as they require authentication
            return result
        
        # Check URL patterns for media content
        url_lower = url.lower()
        has_media_pattern = any(re.search(pattern, url_lower) for pattern in self.MEDIA_URL_PATTERNS)
        
        if not has_media_pattern:
            result['warnings'].append("URL doesn't match common media patterns")
        
        # Try HEAD request for metadata
        try:
            response = requests.head(url, timeout=5, allow_redirects=True)
            
            # Check content type
            content_type = response.headers.get('Content-Type', '').lower()
            if content_type:
                result['metadata']['content_type'] = content_type
                
                if not any(media in content_type for media in ['video', 'audio', 'octet-stream']):
                    result['warnings'].append(f"Unexpected content type: {content_type}")
            
            # Check content length
            content_length = response.headers.get('Content-Length')
            if content_length:
                size_mb = int(content_length) / (1024 * 1024)
                result['metadata']['size_mb'] = round(size_mb, 2)
                
                if size_mb > 500:  # Warn for files over 500MB
                    result['warnings'].append(f"Large file size: {size_mb:.1f}MB")
            
        except requests.RequestException as e:
            # HEAD request failed, but don't invalidate - some servers don't support HEAD
            logger.debug(f"HEAD request failed for {url}: {e}")
            result['warnings'].append("Unable to fetch metadata via HEAD request")
        
        return result
    
    def validate_local_file(self, file_path: str) -> Dict[str, Any]:
        """Validate local media file.
        
        Args:
            file_path: Path to local file
            
        Returns:
            Dictionary with validation results
        """
        result = {
            'valid': True,
            'reason': None,
            'warnings': [],
            'metadata': {}
        }
        
        # Check file exists
        if not os.path.exists(file_path):
            result['valid'] = False
            result['reason'] = "File does not exist"
            return result
        
        # Check file extension
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in self.SUPPORTED_FORMATS:
            result['valid'] = False
            result['reason'] = f"Unsupported format: {ext}"
            return result
        
        # Get file size
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        result['metadata']['size_mb'] = round(file_size_mb, 2)
        
        # Use ffprobe if available for detailed validation
        if self.has_ffprobe:
            probe_result = self._probe_media(file_path)
            if probe_result:
                result['metadata'].update(probe_result)
                
                # Validate duration
                duration = probe_result.get('duration_seconds', 0)
                if duration > self.MAX_DURATION_SECONDS:
                    result['valid'] = False
                    result['reason'] = f"Duration exceeds maximum: {duration:.1f}s > {self.MAX_DURATION_SECONDS}s"
                elif duration < 0.1:
                    result['valid'] = False
                    result['reason'] = f"Duration too short: {duration:.1f}s"
                
                # Check for audio streams
                if probe_result.get('audio_streams', 0) == 0:
                    result['valid'] = False
                    result['reason'] = "No audio stream found"
        
        return result
    
    def _probe_media(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Use ffprobe to get media information.
        
        Args:
            file_path: Path to media file
            
        Returns:
            Dictionary with media metadata or None if probe fails
        """
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'a:0',
                '-show_entries', 'stream=codec_name,channels,sample_rate,bit_rate,duration',
                '-show_entries', 'format=duration,bit_rate,format_name',
                '-of', 'json',
                file_path
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                logger.warning(f"ffprobe failed: {result.stderr}")
                return None
            
            import json
            probe_data = json.loads(result.stdout)
            
            # Extract relevant information
            metadata = {}
            
            # Format information
            format_info = probe_data.get('format', {})
            if 'duration' in format_info:
                metadata['duration_seconds'] = float(format_info['duration'])
            if 'bit_rate' in format_info:
                metadata['bit_rate'] = int(format_info['bit_rate'])
            if 'format_name' in format_info:
                metadata['format_name'] = format_info['format_name']
            
            # Audio stream information - since we use -select_streams a:0, all returned streams are audio
            streams = probe_data.get('streams', [])
            audio_streams = streams  # All streams are audio since we filtered with -select_streams a:0
            metadata['audio_streams'] = len(audio_streams)
            
            if audio_streams:
                audio = audio_streams[0]
                metadata['audio_codec'] = audio.get('codec_name')
                metadata['audio_channels'] = audio.get('channels')
                metadata['audio_sample_rate'] = audio.get('sample_rate')
            
            return metadata
            
        except subprocess.TimeoutExpired:
            logger.warning("ffprobe timed out")
            return None
        except Exception as e:
            logger.warning(f"ffprobe error: {e}")
            return None
    
    def estimate_cost(self, duration_seconds: float, cost_per_minute: float = 0.006) -> Dict[str, float]:
        """Estimate transcription cost.
        
        Args:
            duration_seconds: Media duration in seconds
            cost_per_minute: Cost per minute (default: $0.006)
            
        Returns:
            Dictionary with cost estimates
        """
        duration_minutes = duration_seconds / 60.0
        cost = duration_minutes * cost_per_minute
        
        return {
            'duration_minutes': round(duration_minutes, 2),
            'estimated_cost_usd': round(cost, 4),
            'cost_per_minute': cost_per_minute
        }
    
    def check_media_eligibility(
        self,
        url: str,
        max_duration: Optional[float] = None,
        max_cost: Optional[float] = None
    ) -> Dict[str, Any]:
        """Comprehensive eligibility check for media processing.
        
        Args:
            url: Media URL
            max_duration: Maximum allowed duration in seconds
            max_cost: Maximum allowed cost in USD
            
        Returns:
            Dictionary with eligibility results
        """
        # Start with URL validation
        url_result = self.validate_url(url)
        
        eligibility = {
            'eligible': url_result['valid'],
            'reason': url_result.get('reason'),
            'warnings': url_result.get('warnings', []),
            'metadata': url_result.get('metadata', {}),
            'cost_estimate': None
        }
        
        # If we have duration metadata, check constraints
        if 'duration_seconds' in eligibility['metadata']:
            duration = eligibility['metadata']['duration_seconds']
            
            # Duration check
            if max_duration and duration > max_duration:
                eligibility['eligible'] = False
                eligibility['reason'] = f"Duration {duration:.1f}s exceeds maximum {max_duration}s"
            
            # Cost estimation
            cost_info = self.estimate_cost(duration)
            eligibility['cost_estimate'] = cost_info
            
            # Cost check
            if max_cost and cost_info['estimated_cost_usd'] > max_cost:
                eligibility['eligible'] = False
                eligibility['reason'] = f"Estimated cost ${cost_info['estimated_cost_usd']:.4f} exceeds maximum ${max_cost:.2f}"
        
        return eligibility