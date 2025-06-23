#!/bin/sh
# Start Celery worker with CloudAMQP recommended settings

echo "[WORKER] Starting Celery worker with CloudAMQP optimizations..."
echo "[WORKER] Disabling mingle, gossip, and heartbeat as recommended"

# Force environment variables
export C_FORCE_ROOT=1
export CELERY_DISABLE_RATE_LIMITS=1

# Start worker with explicit flags
exec celery -A celery_app worker \
    -Q ml.summarize \
    --loglevel=debug \
    --pool=solo \
    --without-gossip \
    --without-mingle \
    --without-heartbeat \
    --hostname=llm@%h