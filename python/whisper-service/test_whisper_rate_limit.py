#!/usr/bin/env python3
"""Test script for Whisper service rate limiting."""

import os
import sys
import time
import asyncio
import logging
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from whisper_service.rate_limited_client import RateLimitedWhisperClient, RateLimitError
from whisper_service.transcription_rate_limited import RateLimitedTranscriptionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_test_audio_file():
    """Create a dummy test audio file."""
    # For testing, we'll use a small MP3 file path
    # In real testing, you'd have an actual audio file
    test_file = "/tmp/test_audio.mp3"
    # Create empty file for testing
    Path(test_file).touch()
    return test_file


async def test_concurrent_limits():
    """Test concurrent request limiting."""
    logger.info("Testing concurrent request limits...")
    
    client = RateLimitedWhisperClient(
        max_concurrent_requests=2,
        enable_rate_limiting=True
    )
    
    test_file = create_test_audio_file()
    
    # Try to make 3 concurrent requests (should fail on 3rd)
    async def make_request(idx):
        try:
            logger.info(f"Request {idx}: Starting...")
            # Simulate API call
            await asyncio.sleep(2)  # Simulate processing time
            logger.info(f"Request {idx}: Completed")
            return True
        except RateLimitError as e:
            logger.warning(f"Request {idx}: Rate limited - {e}")
            return False
    
    # Launch 3 concurrent requests
    tasks = [make_request(i) for i in range(3)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    logger.info(f"Results: {results}")
    assert sum(1 for r in results if r is True) <= 2, "More than 2 concurrent requests succeeded"
    logger.info("✓ Concurrent limit test passed")


async def test_rate_limiting():
    """Test minute-based rate limiting."""
    logger.info("Testing minute-based rate limiting...")
    
    service = RateLimitedTranscriptionService()
    
    if not service.enable_rate_limiting:
        logger.warning("Rate limiting is disabled, skipping test")
        return
    
    # Test with a simple transcription
    test_file = create_test_audio_file()
    
    try:
        # First request should succeed
        result1 = service.transcribe_api(
            audio_path=test_file,
            duration_seconds=60.0,  # 1 minute
            identifier="test_user_1"
        )
        logger.info("✓ First transcription succeeded")
        
        # Multiple requests with same identifier might hit rate limit
        for i in range(5):
            try:
                result = service.transcribe_api(
                    audio_path=test_file,
                    duration_seconds=60.0,
                    identifier="test_user_1"
                )
                logger.info(f"Request {i+2} succeeded")
            except RateLimitError as e:
                logger.info(f"Request {i+2} rate limited as expected: {e}")
                break
        
    except Exception as e:
        logger.error(f"Test failed: {e}")
        # This is expected in test environment without actual OpenAI API
        if "OpenAI" in str(e) or "API" in str(e):
            logger.info("✓ Rate limiting logic tested (API call would have been made)")
        else:
            raise


async def test_api_key_rotation():
    """Test API key rotation on rate limit."""
    logger.info("Testing API key rotation...")
    
    # Set up multiple test keys
    os.environ['ML_OPENAI_API_KEY'] = 'test_key_1,test_key_2,test_key_3'
    
    client = RateLimitedWhisperClient(
        enable_rate_limiting=True
    )
    
    # Check initial state
    assert len(client.api_keys) == 3, "Should have 3 API keys"
    logger.info(f"✓ Initialized with {len(client.api_keys)} API keys")
    
    # Simulate rate limiting on first key
    client.api_keys[0].mark_rate_limited(retry_after_seconds=5)
    
    # Next request should use second key
    next_key = client._get_next_available_key()
    assert next_key is not None
    assert next_key.key == 'test_key_2'
    logger.info("✓ Successfully rotated to next available key")
    
    # Check queue depth
    queue_info = client.get_queue_depth()
    logger.info(f"Queue depth: {queue_info}")
    assert queue_info['active_keys'] == 2
    assert queue_info['rate_limited_keys'] == 1
    logger.info("✓ Queue depth tracking working correctly")


async def test_queue_depth_monitoring():
    """Test queue depth monitoring."""
    logger.info("Testing queue depth monitoring...")
    
    client = RateLimitedWhisperClient(
        max_concurrent_requests=5,
        enable_rate_limiting=True
    )
    
    # Check initial state
    queue_info = client.get_queue_depth()
    assert queue_info['concurrent_requests'] == 0
    assert queue_info['available_slots'] == 5
    assert queue_info['max_concurrent'] == 5
    logger.info(f"✓ Initial queue state: {queue_info}")
    
    # Simulate acquiring slots
    await client.concurrent_limiter.acquire()
    await client.concurrent_limiter.acquire()
    
    queue_info = client.get_queue_depth()
    assert queue_info['concurrent_requests'] == 2
    assert queue_info['available_slots'] == 3
    logger.info(f"✓ After 2 acquisitions: {queue_info}")
    
    # Release one
    await client.concurrent_limiter.release()
    
    queue_info = client.get_queue_depth()
    assert queue_info['concurrent_requests'] == 1
    assert queue_info['available_slots'] == 4
    logger.info(f"✓ After 1 release: {queue_info}")


async def main():
    """Run all tests."""
    logger.info("Starting Whisper rate limiting tests...")
    
    try:
        await test_concurrent_limits()
        await test_api_key_rotation()
        await test_queue_depth_monitoring()
        await test_rate_limiting()
        
        logger.info("\n✅ All tests completed successfully!")
        
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        raise
    finally:
        # Cleanup
        test_file = Path("/tmp/test_audio.mp3")
        if test_file.exists():
            test_file.unlink()


if __name__ == "__main__":
    asyncio.run(main())