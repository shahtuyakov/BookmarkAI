"""
Shared Celery configuration for BookmarkAI ML services.
Based on ADR-025: Python ML Microservice Framework & Messaging Architecture
"""
import os
from typing import Dict, Any
from kombu import Queue, Exchange


def get_celery_config() -> Dict[str, Any]:
    """Get Celery configuration with environment overrides."""
    
    # Broker configuration
    broker_url = os.environ.get(
        'CELERY_BROKER_URL',
        'amqp://ml:ml_password@localhost:5672/'
    )
    
    # Result backend configuration
    result_backend = os.environ.get(
        'CELERY_RESULT_BACKEND',
        'redis://localhost:6379/1'
    )
    
    # Create exchanges
    default_exchange = Exchange('bookmarkai.tasks', type='direct', durable=True)
    ml_exchange = Exchange('bookmarkai.ml', type='topic', durable=True)
    
    # Define queues with quorum type as per ADR-025
    queue_arguments = {
        'x-queue-type': 'quorum',
        'x-delivery-limit': 5,  # Max retries before dead-lettering
    }
    
    config = {
        # Broker settings
        'broker_url': broker_url,
        'result_backend': result_backend,
        
        # Transport options for publisher confirms (ADR-025)
        'broker_transport_options': {
            'confirm_publish': True,
            'max_retries': 5,
            'interval_start': 0,
            'interval_step': 0.2,
            'interval_max': 1,
        },
        
        # Serialization
        'task_serializer': 'json',
        'result_serializer': 'json',
        'accept_content': ['json'],
        'timezone': 'UTC',
        'enable_utc': True,
        
        # Task execution
        'task_track_started': True,
        'task_send_sent_event': True,
        'result_expires': 3600,  # 1 hour
        
        # Worker settings
        'worker_prefetch_multiplier': int(os.environ.get('WORKER_PREFETCH_MULTIPLIER', '1')),
        'worker_max_tasks_per_child': int(os.environ.get('WORKER_MAX_TASKS_PER_CHILD', '50')),
        'worker_disable_rate_limits': False,
        
        # Queue configuration
        'task_queues': (
            Queue(
                'ml.transcribe',
                ml_exchange,
                routing_key='ml.transcribe',
                queue_arguments=queue_arguments,
                durable=True,
            ),
            Queue(
                'ml.summarize',
                ml_exchange,
                routing_key='ml.summarize',
                queue_arguments=queue_arguments,
                durable=True,
            ),
            Queue(
                'ml.embed',
                ml_exchange,
                routing_key='ml.embed',
                queue_arguments=queue_arguments,
                durable=True,
            ),
        ),
        
        # Routing
        'task_routes': {
            'llm_service.tasks.summarize_content': {'queue': 'ml.summarize'},
            'whisper_service.tasks.transcribe_audio': {'queue': 'ml.transcribe'},
            'vector_service.tasks.generate_embeddings': {'queue': 'ml.embed'},
        },
        
        # Task behavior
        'task_acks_late': True,
        'task_reject_on_worker_lost': True,
        'task_ignore_result': False,
        
        # Error handling
        'task_default_retry_delay': 60,  # 1 minute
        'task_max_retries': 3,
        
        # Monitoring
        'worker_send_task_events': True,
        'task_send_sent_event': True,
    }
    
    return config


def get_redis_url() -> str:
    """Get Redis URL for singleton locks and caching."""
    return os.environ.get('REDIS_URL', 'redis://localhost:6379/0')


def get_database_url() -> str:
    """Get PostgreSQL database URL."""
    return os.environ.get(
        'DATABASE_URL',
        'postgresql://bookmarkai:bookmarkai_password@localhost:5432/bookmarkai_dev'
    )