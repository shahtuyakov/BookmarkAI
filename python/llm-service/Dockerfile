FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY llm-service/requirements.txt .
COPY requirements-base.txt requirements-base.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy common module
COPY common /app/common

# Copy service code
COPY llm-service /app/llm_service

# Set Python path to include both app and service directory
ENV PYTHONPATH=/app:/app/llm_service:$PYTHONPATH

# Set working directory
WORKDIR /app/llm_service

# Run Celery worker using the local celery_app that imports tasks
CMD ["celery", "-A", "celery_app", "worker", \
     "-Q", "ml.summarize", \
     "--concurrency=4", \
     "--prefetch-multiplier=8", \
     "--loglevel=info", \
     "--hostname=llm@%h", \
     "-O", "fair"]