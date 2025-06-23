"""Minimal Celery configuration for debugging."""

import os
from celery import Celery
from kombu import Exchange, Queue

# Create minimal Celery app
celery_app = Celery(
    "bookmarkai",
    broker=f"amqp://ml:ml_password@{os.getenv('RABBITMQ_HOST', 'localhost')}:5672//",
    backend="rpc://",
)

# Minimal configuration - disable ALL control features
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Disable ALL worker control features
    worker_hijack_root_logger=False,
    worker_log_color=False,
    worker_disable_rate_limits=True,
    
    # CRITICAL: Use solo pool and disable all distributed features
    worker_pool='solo',
    worker_concurrency=1,
    worker_prefetch_multiplier=1,
    
    # Completely disable control mechanisms
    worker_enable_remote_control=False,
    worker_send_task_events=False,
    task_send_sent_event=False,
    
    # Force disable gossip and heartbeat
    worker_gossip=False,
    worker_heartbeat=False,
    
    # This is the key - disable consumer gossip
    worker_consumer_gossip=False,
    
    # Broker settings
    broker_connection_retry=False,
    broker_connection_retry_on_startup=False,
    
    # Simple transport options
    broker_transport_options={
        'confirm_publish': True,
        'max_retries': 3,
    },
)

# Define simple queues
default_exchange = Exchange("ml.tasks", type="topic", durable=True)

celery_app.conf.task_queues = (
    Queue(
        "ml.summarize",
        exchange=default_exchange,
        routing_key="summarize_llm",
    ),
)

print("[DEBUG] Minimal Celery app configured")