"""
Prometheus metrics for BookmarkAI ML services.

This module provides centralized metrics collection for all ML workers.
"""
import time
import functools
import logging
from typing import Callable, Optional, Dict, Any
from prometheus_client import (
    Counter, Histogram, Gauge, Info,
    generate_latest, CONTENT_TYPE_LATEST,
    CollectorRegistry, multiprocess, start_http_server
)
from prometheus_client.multiprocess import MultiProcessCollector
import os

logger = logging.getLogger(__name__)

# Check if multiprocess mode is needed
multiproc_dir = os.environ.get('PROMETHEUS_MULTIPROC_DIR')
if multiproc_dir:
    # Ensure the directory exists
    os.makedirs(multiproc_dir, exist_ok=True)
    # In multiprocess mode, we need to use a custom registry
    registry = CollectorRegistry()
    MultiProcessCollector(registry)
else:
    # In single process mode, use the default registry
    from prometheus_client import REGISTRY as registry

# Task metrics
task_counter = Counter(
    'ml_tasks_total',
    'Total number of ML tasks processed',
    ['task_name', 'status', 'worker_type'],
    registry=registry
)

task_duration = Histogram(
    'ml_task_duration_seconds',
    'Time spent processing ML tasks',
    ['task_name', 'worker_type'],
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600),
    registry=registry
)

task_errors = Counter(
    'ml_task_errors_total',
    'Total number of ML task errors',
    ['task_name', 'error_type', 'worker_type'],
    registry=registry
)

# Resource metrics
active_tasks = Gauge(
    'ml_active_tasks',
    'Number of currently active ML tasks',
    ['task_name', 'worker_type'],
    registry=registry
)

# Cost metrics
ml_cost_total = Counter(
    'ml_cost_dollars_total',
    'Total cost of ML operations in dollars',
    ['task_type', 'model', 'worker_type'],
    registry=registry
)

# Token/usage metrics
tokens_processed = Counter(
    'ml_tokens_processed_total',
    'Total number of tokens processed',
    ['task_type', 'model', 'token_type'],
    registry=registry
)

audio_duration_processed = Counter(
    'ml_audio_duration_seconds_total',
    'Total audio duration processed in seconds',
    ['task_type', 'model'],
    registry=registry
)

# Budget metrics
budget_remaining = Gauge(
    'ml_budget_remaining_dollars',
    'Remaining budget in dollars',
    ['budget_type', 'service'],
    registry=registry
)

budget_exceeded_total = Counter(
    'ml_budget_exceeded_total',
    'Number of times budget was exceeded',
    ['budget_type', 'service'],
    registry=registry
)

# Model performance metrics
model_latency = Histogram(
    'ml_model_latency_seconds',
    'Model inference latency',
    ['model', 'task_type'],
    buckets=(0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30),
    registry=registry
)

# Worker info
worker_info = Info(
    'ml_worker',
    'ML worker information',
    registry=registry
)


def task_metrics(worker_type: str):
    """
    Decorator to automatically collect task metrics.
    
    Args:
        worker_type: Type of worker (e.g., 'whisper', 'llm', 'vector')
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            task_name = func.__name__
            active_tasks.labels(task_name=task_name, worker_type=worker_type).inc()
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                task_counter.labels(
                    task_name=task_name,
                    status='success',
                    worker_type=worker_type
                ).inc()
                return result
            except Exception as e:
                task_counter.labels(
                    task_name=task_name,
                    status='failure',
                    worker_type=worker_type
                ).inc()
                task_errors.labels(
                    task_name=task_name,
                    error_type=type(e).__name__,
                    worker_type=worker_type
                ).inc()
                raise
            finally:
                duration = time.time() - start_time
                task_duration.labels(
                    task_name=task_name,
                    worker_type=worker_type
                ).observe(duration)
                active_tasks.labels(task_name=task_name, worker_type=worker_type).dec()
        
        return wrapper
    return decorator


def track_ml_cost(amount: float, task_type: str, model: str, worker_type: str):
    """Track ML operation costs."""
    ml_cost_total.labels(
        task_type=task_type,
        model=model,
        worker_type=worker_type
    ).inc(amount)


def track_tokens(count: int, task_type: str, model: str, token_type: str = 'total'):
    """Track token usage."""
    tokens_processed.labels(
        task_type=task_type,
        model=model,
        token_type=token_type
    ).inc(count)


def track_audio_duration(seconds: float, task_type: str, model: str):
    """Track audio duration processed."""
    audio_duration_processed.labels(
        task_type=task_type,
        model=model
    ).inc(seconds)


def update_budget_remaining(amount: float, budget_type: str, service: str):
    """Update remaining budget gauge."""
    budget_remaining.labels(
        budget_type=budget_type,
        service=service
    ).set(amount)


def track_budget_exceeded(budget_type: str, service: str):
    """Track budget exceeded events."""
    budget_exceeded_total.labels(
        budget_type=budget_type,
        service=service
    ).inc()


def track_model_latency(duration: float, model: str, task_type: str):
    """Track model inference latency."""
    model_latency.labels(
        model=model,
        task_type=task_type
    ).observe(duration)


def set_worker_info(info: Dict[str, str]):
    """Set worker information."""
    worker_info.info(info)


class MetricsServer:
    """HTTP server for Prometheus metrics endpoint."""
    
    def __init__(self, port: int = 9090):
        self.port = port
        self._server = None
    
    def start(self):
        """Start the metrics HTTP server."""
        try:
            # For multiprocess mode, we need to use the generate_latest function
            if os.environ.get('PROMETHEUS_MULTIPROC_DIR'):
                logger.info(f"Starting metrics server on port {self.port} (multiprocess mode)")
                # In production, we'll use a separate process or gunicorn
                # For now, we'll use the simple server
                start_http_server(self.port, registry=registry)
            else:
                logger.info(f"Starting metrics server on port {self.port}")
                start_http_server(self.port)
            
            logger.info(f"Metrics available at http://localhost:{self.port}/metrics")
        except Exception as e:
            logger.error(f"Failed to start metrics server: {e}")
    
    def get_metrics(self) -> bytes:
        """Get current metrics as Prometheus format."""
        return generate_latest(registry)


# Celery task metrics integration
def setup_celery_metrics(app):
    """
    Set up Celery signal handlers for automatic metrics collection.
    
    Args:
        app: Celery application instance
    """
    from celery import signals
    
    @signals.task_prerun.connect
    def task_prerun_handler(sender=None, task_id=None, task=None, **kwargs):
        """Handle task prerun signal."""
        if task:
            worker_type = os.environ.get('WORKER_TYPE', 'unknown')
            active_tasks.labels(
                task_name=task.name,
                worker_type=worker_type
            ).inc()
    
    @signals.task_postrun.connect
    def task_postrun_handler(sender=None, task_id=None, task=None, **kwargs):
        """Handle task postrun signal."""
        if task:
            worker_type = os.environ.get('WORKER_TYPE', 'unknown')
            active_tasks.labels(
                task_name=task.name,
                worker_type=worker_type
            ).dec()
    
    @signals.task_success.connect
    def task_success_handler(sender=None, result=None, **kwargs):
        """Handle task success signal."""
        if sender:
            worker_type = os.environ.get('WORKER_TYPE', 'unknown')
            task_counter.labels(
                task_name=sender.name,
                status='success',
                worker_type=worker_type
            ).inc()
    
    @signals.task_failure.connect
    def task_failure_handler(sender=None, exception=None, **kwargs):
        """Handle task failure signal."""
        if sender:
            worker_type = os.environ.get('WORKER_TYPE', 'unknown')
            task_counter.labels(
                task_name=sender.name,
                status='failure',
                worker_type=worker_type
            ).inc()
            
            if exception:
                task_errors.labels(
                    task_name=sender.name,
                    error_type=type(exception).__name__,
                    worker_type=worker_type
                ).inc()
    
    @signals.task_retry.connect
    def task_retry_handler(sender=None, reason=None, **kwargs):
        """Handle task retry signal."""
        if sender:
            worker_type = os.environ.get('WORKER_TYPE', 'unknown')
            task_counter.labels(
                task_name=sender.name,
                status='retry',
                worker_type=worker_type
            ).inc()