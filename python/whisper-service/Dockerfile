FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY whisper-service/requirements.txt .
COPY requirements-base.txt requirements-base.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy common module
COPY common /app/common

# Copy service code
COPY whisper-service /app/whisper_service

# Set Python path to include both app and service directory
ENV PYTHONPATH=/app:/app/whisper_service:$PYTHONPATH

# Set working directory
WORKDIR /app/whisper_service

# Run Celery worker using the local celery_app that imports tasks
CMD ["celery", "-A", "celery_app", "worker", \
     "-Q", "ml.transcribe", \
     "--concurrency=1", \
     "--prefetch-multiplier=1", \
     "--loglevel=info", \
     "--hostname=whisper@%h", \
     "-O", "fair"]