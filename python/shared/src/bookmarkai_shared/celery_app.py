"""
Base Celery application for BookmarkAI ML services.
"""
import os
import logging
from celery import Celery, Task
from celery.signals import worker_process_init, worker_process_shutdown
from .celery_config import get_celery_config

# Configure logging
logger = logging.getLogger(__name__)


class MLTask(Task):
    """Base task class with common functionality for ML tasks."""
    
    autoretry_for = (Exception,)
    max_retries = 3
    default_retry_delay = 60
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Log task failures."""
        logger.error(
            f"Task {self.name}[{task_id}] failed: {exc}",
            extra={
                'task_id': task_id,
                'task_name': self.name,
                'exception': str(exc),
                'args': args,
                'kwargs': kwargs,
            }
        )
        super().on_failure(exc, task_id, args, kwargs, einfo)
    
    def on_success(self, retval, task_id, args, kwargs):
        """Log task success."""
        logger.info(
            f"Task {self.name}[{task_id}] succeeded",
            extra={
                'task_id': task_id,
                'task_name': self.name,
                'args': args,
                'kwargs': kwargs,
            }
        )
        super().on_success(retval, task_id, args, kwargs)


def create_celery_app(name: str = 'bookmarkai.ml') -> Celery:
    """Create and configure a Celery application."""
    
    # Create Celery instance
    app = Celery(name)
    
    # Load configuration
    config = get_celery_config()
    app.config_from_object(config)
    
    # Set default task class
    app.Task = MLTask
    
    return app


# Signal handlers for worker lifecycle
@worker_process_init.connect
def init_worker_process(sender=None, **kwargs):
    """Initialize worker process."""
    logger.info("Worker process initializing")
    
    # Initialize OpenTelemetry if available
    try:
        from opentelemetry.instrumentation.celery import CeleryInstrumentor
        CeleryInstrumentor().instrument()
        logger.info("OpenTelemetry instrumentation enabled")
    except ImportError:
        logger.warning("OpenTelemetry not available, skipping instrumentation")
    
    # Clear stale singleton locks if using celery-singleton
    try:
        from celery_singleton import clear_locks
        from .celery_config import get_redis_url
        import redis
        
        redis_client = redis.from_url(get_redis_url())
        clear_locks(redis_client)
        logger.info("Cleared stale singleton locks")
    except Exception as e:
        logger.warning(f"Failed to clear singleton locks: {e}")


@worker_process_shutdown.connect
def shutdown_worker_process(sender=None, **kwargs):
    """Clean up worker process on shutdown."""
    logger.info("Worker process shutting down")
    
    # Add any cleanup code here (e.g., close database connections, GPU cleanup)
    pass