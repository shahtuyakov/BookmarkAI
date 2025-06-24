# Whisper Service

Transcription service for BookmarkAI using OpenAI's Whisper API.

## Overview

This service provides audio transcription capabilities for BookmarkAI, processing media files from TikTok, Reddit, and Twitter/X videos. It extracts audio, handles chunking for API limits, and provides time-stamped transcriptions.

## Features

- **API-based transcription** using OpenAI Whisper API
- **Audio extraction** from video files using ffmpeg
- **Smart chunking** for files exceeding API limits (25MB/10 minutes)
- **Cost tracking** per transcription
- **Prometheus metrics** for monitoring
- **Future GPU support** ready (ml.transcribe_local queue)

## Architecture

Following ADR-025, this service implements:
- Celery worker with singleton pattern
- RabbitMQ messaging with quorum queues
- PostgreSQL result storage
- Cost-optimized processing pipeline

## Configuration

### Environment Variables

```bash
# Celery/RabbitMQ
CELERY_BROKER_URL=amqp://ml:ml_password@rabbitmq:5672/
CELERY_RESULT_BACKEND=redis://redis:6379/1

# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=bookmarkai_dev
POSTGRES_USER=bookmarkai
POSTGRES_PASSWORD=bookmarkai_password

# OpenAI
OPENAI_API_KEY=your-api-key

# Cost Controls (set to 0 for unlimited)
WHISPER_DAILY_COST_LIMIT=10.00
WHISPER_HOURLY_COST_LIMIT=1.00

# Silence Detection
WHISPER_SILENCE_THRESHOLD_DB=-40.0

# Worker Settings
WORKER_PREFETCH_MULTIPLIER=8
WORKER_MAX_TASKS_PER_CHILD=50
```

## Development

### Local Setup

```bash
# Install dependencies
cd python/whisper-service
pip install -e ../shared
pip install -e .

# Run worker
celery -A whisper_service.celery_app worker --loglevel=info --queues=ml.transcribe
```

### Docker

```bash
# Build and run with docker-compose
docker-compose -f docker/docker-compose.ml.yml up whisper-worker
```

## Cost Analysis

- API cost: $0.006 per minute of audio
- Break-even point: ~60 audio-hours per day for GPU deployment
- Monitoring: Check Grafana dashboard for usage trends

### Cost Budget Protection

The service implements automatic cost budget protection to prevent runaway expenses:

1. **Pre-flight Check**: Before downloading media, estimates cost based on duration metadata
2. **Actual Duration Check**: After audio extraction, verifies actual cost won't exceed limits
3. **Budget Enforcement**: Rejects tasks that would exceed hourly or daily limits
4. **Graceful Degradation**: Returns clear error messages when limits are exceeded

Example budget exceeded response:
```json
{
    "error": "BudgetExceededError",
    "message": "Budget limit exceeded: Would exceed daily limit: $9.85 + $0.25 > $10.00",
    "current_hourly_cost": 0.85,
    "current_daily_cost": 9.85,
    "hourly_limit": 1.00,
    "daily_limit": 10.00
}
```

### Media Pre-flight Validation

The service performs comprehensive validation before processing:

1. **URL Validation**: Checks URL format and media patterns
2. **Format Support**: Validates against supported audio/video formats
3. **Duration Limits**: Rejects media over 30 minutes
4. **File Integrity**: Uses ffprobe to validate media streams
5. **Early Cost Estimation**: Estimates cost before download when possible

Supported formats:
- Audio: `.mp3`, `.wav`, `.m4a`, `.aac`, `.flac`, `.ogg`, `.opus`
- Video: `.mp4`, `.webm`, `.avi`, `.mov`, `.mkv`

Example pre-flight failure:
```json
{
    "error": "TranscriptionError",
    "message": "Pre-flight validation failed: Duration exceeds maximum: 1850.2s > 1800s"
}
```

### Silence Detection

The service automatically detects and skips silent or near-silent audio to save costs:

1. **Volume Analysis**: Uses ffmpeg volumedetect to analyze audio levels
2. **Configurable Threshold**: Default -40dB (adjustable via `WHISPER_SILENCE_THRESHOLD_DB`)
3. **Cost Savings**: Silent audio is not sent to OpenAI API
4. **Clear Reporting**: Returns special result indicating silent audio

Example silent audio response:
```json
{
    "share_id": "uuid",
    "success": true,
    "skipped": true,
    "skip_reason": "Audio is nearly silent (mean: -52.3dB, max: -38.1dB)",
    "result": {
        "text": "[Audio appears to be silent or extremely quiet]",
        "billing_usd": 0.0,
        "backend": "skipped"
    },
    "metrics": {
        "mean_volume_db": -52.3,
        "max_volume_db": -38.1
    }
}
```

## Task Structure

```python
# Task payload
{
    "share_id": "uuid",
    "content": {
        "mediaUrl": "https://..."
    },
    "options": {
        "language": null,  # Auto-detect
        "backend": "api"   # or "local" for GPU
    }
}

# Result structure
{
    "text": "Full transcription text",
    "segments": [
        {
            "start": 0.0,
            "end": 2.5,
            "text": "Segment text"
        }
    ],
    "language": "en",
    "duration_seconds": 120.5,
    "billing_usd": 0.0121,
    "backend": "api"
}
```

## Future Enhancements

- GPU worker with faster-whisper
- Smart routing based on load
- Language-specific optimizations
- Subtitle/SRT export support