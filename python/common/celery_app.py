"""Celery application configuration for BookmarkAI ML services."""

import os
from typing import Any, Dict

from celery import Celery, Task
from celery.signals import setup_logging, worker_process_init
from celery_singleton import clear_locks
from kombu import Exchange, Queue

from .config import settings
from .observability import init_telemetry


# Configure Celery
celery_app = Celery(
    "bookmarkai",
    broker=settings.rabbitmq_uri,
    backend="rpc://",
)

# Celery configuration
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution
    task_time_limit=settings.task_time_limit,
    task_soft_time_limit=settings.task_soft_time_limit,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_acks_on_failure_or_timeout=True,
    
    # Worker configuration - critical for quorum queues
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=50,
    task_ignore_result=True,
    # Disable all distributed features
    worker_enable_remote_control=False,
    worker_send_task_events=False,  # Disable events
    # Set connection retry
    broker_connection_retry_on_startup=True,
    # Enable connection retry for resilience
    broker_connection_retry=True,
    broker_connection_max_retries=10,
    # Enable heartbeat for connection monitoring
    broker_heartbeat=60,
    # Remove global pool setting to allow per-worker configuration
    # worker_pool='solo',
    # Important: Disable consumer prefetch for quorum queues
    broker_transport_options={
        'priority_steps': list(range(10)),
        'visibility_timeout': 43200,
        'confirm_publish': True,
        'max_retries': 3,
        'interval_start': 0,
        'interval_step': 0.2,
        'interval_max': 0.5,
    },
    # Control queue settings
    control_queue_expires=60.0,
    control_queue_ttl=300.0,
    # Ensure reply queues work
    result_backend_transport_options={'master_name': "mymaster"},
    
    # Result backend
    result_expires=3600,  # 1 hour
    result_persistent=True,
    
    # Singleton configuration
    singleton_backend_url=settings.redis_uri,
    singleton_key_prefix="celery_singleton:",
)

# Define exchanges and queues
default_exchange = Exchange("ml.tasks", type="topic", durable=True)

celery_app.conf.task_queues = (
    # Default celery queue for control messages - MUST be classic queue
    Queue(
        "celery",
        Exchange("celery", type="direct"),
        routing_key="celery",
        queue_arguments={
            "x-queue-type": "classic",  # Control queue must remain classic
        },
    ),
    Queue(
        "ml.transcribe",
        exchange=default_exchange,
        routing_key="transcribe_whisper",
        queue_arguments={
            "x-queue-type": "classic",  # Temporarily use classic for testing
        },
    ),
    Queue(
        "ml.summarize",
        exchange=default_exchange,
        routing_key="summarize_llm",
        queue_arguments={
            "x-queue-type": "classic",  # Temporarily use classic for testing
        },
    ),
    Queue(
        "ml.embed",
        exchange=default_exchange,
        routing_key="embed_vectors",
        queue_arguments={
            "x-queue-type": "classic",  # Temporarily use classic for testing
        },
    ),
)

# Task routing
celery_app.conf.task_routes = {
    "whisper_service.tasks.transcribe_whisper": {
        "queue": "ml.transcribe",
        "routing_key": "transcribe_whisper",
    },
    "llm_service.tasks.summarize_llm": {
        "queue": "ml.summarize",
        "routing_key": "summarize_llm",
    },
    "vector_service.tasks.embed_vectors": {
        "queue": "ml.embed",
        "routing_key": "embed_vectors",
    },
}

# Default queue configuration
celery_app.conf.task_default_queue = "ml.summarize"
celery_app.conf.task_default_exchange = "ml.tasks"
celery_app.conf.task_default_exchange_type = "topic"
celery_app.conf.task_default_routing_key = "ml.default"


class MLTask(Task):
    """Base task class with additional ML-specific functionality."""

    autoretry_for = (Exception,)
    max_retries = 3
    retry_backoff = True
    retry_backoff_max = 300
    retry_jitter = True

    def before_start(self, task_id: str, args: tuple, kwargs: dict, **options: Any) -> None:
        """Called before task execution starts."""
        # Add trace context if available
        if "traceparent" in kwargs:
            # Propagate trace context
            pass

    def on_failure(
        self, exc: Exception, task_id: str, args: tuple, kwargs: dict, einfo: Any
    ) -> None:
        """Called on task failure."""
        # Log failure with context
        import logging

        logger = logging.getLogger(__name__)
        logger.error(
            f"Task {self.name} failed",
            extra={
                "task_id": task_id,
                "share_id": kwargs.get("share_id"),
                "error": str(exc),
            },
            exc_info=True,
        )


# Signal handlers
@setup_logging.connect
def setup_custom_logging(**kwargs: Any) -> None:
    """Configure JSON logging."""
    import logging
    from pythonjsonlogger import jsonlogger

    # Configure root logger
    logHandler = logging.StreamHandler()
    formatter = jsonlogger.JsonFormatter(
        "%(timestamp)s %(level)s %(name)s %(message)s",
        timestamp=True,
    )
    logHandler.setFormatter(formatter)
    
    logging.root.handlers = [logHandler]
    logging.root.setLevel(settings.log_level)


@worker_process_init.connect
def init_worker_process(**kwargs: Any) -> None:
    """Initialize worker process."""
    # Initialize OpenTelemetry
    init_telemetry()
    
    # Clear any stale locks
    clear_locks(celery_app)


# Create task decorator with base class
task = celery_app.task(base=MLTask)