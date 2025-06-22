"""Common utilities for ML services."""

import hashlib
import time
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, cast
from uuid import UUID

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import settings


T = TypeVar("T")


def generate_dedup_key(share_id: UUID, task_type: str) -> str:
    """Generate deduplication key for a task."""
    key_data = f"{share_id}:{task_type}"
    return f"dedup:{hashlib.sha256(key_data.encode()).hexdigest()}"


def measure_time(func: Callable[..., T]) -> Callable[..., T]:
    """Decorator to measure function execution time."""
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> T:
        start_time = time.time()
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            elapsed_ms = int((time.time() - start_time) * 1000)
            # Log or store the timing
            import logging
            logger = logging.getLogger(func.__module__)
            logger.info(
                f"{func.__name__} completed",
                extra={
                    "function": func.__name__,
                    "elapsed_ms": elapsed_ms,
                }
            )
    
    return cast(Callable[..., T], wrapper)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=4, max=10),
)
async def download_media(url: str, timeout: int = 30) -> bytes:
    """Download media file from URL with retry logic."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            url,
            timeout=timeout,
            follow_redirects=True,
        )
        response.raise_for_status()
        return response.content


def format_error_response(error: Exception, task_id: Optional[str] = None) -> dict[str, Any]:
    """Format error response for consistent error handling."""
    return {
        "success": False,
        "error": {
            "type": type(error).__name__,
            "message": str(error),
            "task_id": task_id,
        },
    }


def validate_media_url(url: str) -> bool:
    """Validate that the URL points to a supported media file."""
    # Check URL scheme
    if not url.startswith(("http://", "https://", "s3://")):
        return False
    
    # Check file extension
    supported_extensions = {
        ".mp4", ".mp3", ".wav", ".m4a", ".webm",
        ".mov", ".avi", ".flac", ".ogg", ".aac"
    }
    
    url_lower = url.lower()
    return any(url_lower.endswith(ext) for ext in supported_extensions)


def get_s3_client():
    """Get configured S3 client."""
    import boto3
    from botocore.config import Config
    
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.s3_use_path_style else "auto"},
        ),
    )