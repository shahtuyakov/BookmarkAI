# LLM Service Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy shared module first
COPY shared /shared
RUN pip install -e /shared

# Copy service requirements and install
COPY llm-service/setup.py .
COPY llm-service/src/ ./src/
RUN pip install -e .

# Create non-root user
RUN useradd -m -u 1000 celeryuser && chown -R celeryuser:celeryuser /app
USER celeryuser

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV CELERY_LOG_LEVEL=info

# Default command (will be overridden in docker-compose)
CMD ["celery", "-A", "llm_service.celery_app", "worker", "--loglevel=info"]