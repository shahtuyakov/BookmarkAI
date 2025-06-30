# Vector Service Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy shared module first
COPY shared /shared
RUN pip install -e /shared

# Copy service requirements and install
COPY vector-service/setup.py .
COPY vector-service/src/ ./src/
RUN pip install -e .

# Create non-root user and prometheus multiprocess directory
RUN useradd -m -u 1000 celeryuser && \
    mkdir -p /tmp/prometheus_multiproc_vector && \
    chown -R celeryuser:celeryuser /app /tmp/prometheus_multiproc_vector

USER celeryuser

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CELERY_LOG_LEVEL=info
ENV WORKER_TYPE=vector
ENV SERVICE_NAME=vector-service

# Default command (will be overridden in docker-compose)
CMD ["celery", "-A", "vector_service.celery_app", "worker", "--loglevel=info", "--queues=ml.embed", "--concurrency=4", "--prefetch-multiplier=8"]