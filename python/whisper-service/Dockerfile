FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared module first
COPY shared /app/shared
RUN pip install -e /app/shared

# Copy whisper service
COPY whisper-service /app/whisper-service
RUN pip install -e /app/whisper-service

# Create user and prometheus directory
RUN useradd -m -u 1000 celeryuser && \
    mkdir -p /tmp/prometheus_multiproc_whisper && \
    chown -R celeryuser:celeryuser /app /tmp/prometheus_multiproc_whisper

USER celeryuser

WORKDIR /app/whisper-service

# Default to API worker
CMD ["celery", "-A", "whisper_service.celery_app", "worker", "--loglevel=info", "--queues=ml.transcribe", "--concurrency=4", "--prefetch-multiplier=8"]