#!/bin/sh
# Start Celery worker for LLM service

echo "[WORKER] Starting LLM Celery worker..."
echo "[WORKER] Current directory: $(pwd)"
echo "[WORKER] Python path: $PYTHONPATH"

# Start worker with standardized configuration
exec celery -A celery_app worker \
    -Q ml.summarize \
    --loglevel=debug \
    --pool=solo \
    --hostname=llm@%h \
    -O fair \
    --without-mingle \
    --without-gossip \
    --without-heartbeat