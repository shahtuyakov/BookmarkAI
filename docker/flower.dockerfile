FROM python:3.10-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements-base.txt requirements-base.txt

# Install Python dependencies including Flower
RUN pip install --no-cache-dir -r requirements-base.txt && \
    pip install --no-cache-dir flower==2.0.1

# Copy common module
COPY common /app/common

# Copy flower app
COPY flower_app.py /app/

# Set Python path
ENV PYTHONPATH=/app

# Run Flower
CMD ["celery", "-A", "flower_app", "flower"]