FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY vector-service/requirements.txt .
COPY requirements-base.txt requirements-base.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy common module
COPY common /app/common

# Copy service code
COPY vector-service /app/vector_service

# Set Python path to include both app and service directory
ENV PYTHONPATH=/app:/app/vector_service:$PYTHONPATH

# Set working directory
WORKDIR /app/vector_service

# Run Celery worker using the local celery_app that imports tasks
CMD ["celery", "-A", "celery_app", "worker", \
     "-Q", "ml.embed", \
     "--concurrency=4", \
     "--prefetch-multiplier=8", \
     "--loglevel=info", \
     "--hostname=vector@%h", \
     "-O", "fair"]