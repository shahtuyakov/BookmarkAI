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
    
    # Force queue creation on startup
    app.conf.update(
        task_create_missing_queues=True,
    )
    
    # Set up Prometheus metrics for Celery
    try:
        from .metrics import setup_celery_metrics
        setup_celery_metrics(app)
        logger.info("Prometheus metrics integration enabled for Celery")
    except Exception as e:
        logger.warning(f"Failed to set up Prometheus metrics: {e}")
    
    return app


# Signal handlers for worker lifecycle
from celery.signals import worker_ready

@worker_ready.connect
def declare_queues(sender=None, **kwargs):
    """Declare queues when worker is ready."""
    try:
        logger.info("Declaring queues on worker startup")
        # Get the app from the sender
        app = sender.app if hasattr(sender, 'app') else None
        if app:
            # Declare all configured queues
            with app.pool.acquire(block=True) as conn:
                for queue in app.conf.task_queues:
                    queue(conn).declare()
                    logger.info(f"Declared queue: {queue.name}")
    except Exception as e:
        logger.error(f"Failed to declare queues: {e}")

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
    
    # Initialize Prometheus metrics
    try:
        from .metrics import MetricsServer, set_worker_info
        import platform
        
        # Set worker information
        worker_info = {
            'hostname': platform.node(),
            'worker_type': os.environ.get('WORKER_TYPE', 'unknown'),
            'python_version': platform.python_version(),
            'service': os.environ.get('SERVICE_NAME', 'unknown'),
        }
        set_worker_info(worker_info)
        
        # Start metrics server on first worker only
        if os.environ.get('PROMETHEUS_METRICS_PORT'):
            metrics_port = int(os.environ.get('PROMETHEUS_METRICS_PORT', '9090'))
            metrics_server = MetricsServer(port=metrics_port)
            metrics_server.start()
            logger.info(f"Prometheus metrics server started on port {metrics_port}")
    except Exception as e:
        logger.warning(f"Failed to initialize Prometheus metrics: {e}")


@worker_process_shutdown.connect
def shutdown_worker_process(sender=None, **kwargs):
    """Clean up worker process on shutdown."""
    logger.info("Worker process shutting down")
    
    # Add any cleanup code here (e.g., close database connections, GPU cleanup)
    pass