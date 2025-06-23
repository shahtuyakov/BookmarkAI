#!/usr/bin/env python3
"""Minimal test worker to debug Celery startup issues."""

from celery import Celery

# Create minimal Celery app
app = Celery(
    'test',
    broker='amqp://ml:ml_password@rabbitmq:5672//',
    backend='rpc://'
)

# Minimal configuration
app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    # Disable all the distributed features
    worker_gossip=False,
    worker_mingle=False,
    worker_enable_remote_control=False,
    worker_send_task_events=False,
)

@app.task
def test_task(x, y):
    """Simple test task."""
    return x + y

if __name__ == '__main__':
    # Start worker
    app.worker_main([
        'worker',
        '--loglevel=info',
        '--without-gossip',
        '--without-mingle',
        '--without-heartbeat'
    ])