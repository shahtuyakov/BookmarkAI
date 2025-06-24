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

# Cost Controls
WHISPER_DAILY_COST_LIMIT=10.00
WHISPER_HOURLY_COST_LIMIT=1.00

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