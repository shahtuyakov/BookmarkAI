"""
Shared Celery configuration for BookmarkAI ML services.
Based on ADR-025: Python ML Microservice Framework & Messaging Architecture
"""
import os
import ssl
from typing import Dict, Any, Optional
from kombu import Queue, Exchange
import logging

logger = logging.getLogger(__name__)


def get_ssl_options() -> Optional[Dict[str, Any]]:
    """Get SSL/TLS options for broker connection."""
    use_ssl = os.environ.get('RABBITMQ_USE_SSL', 'false').lower() == 'true'
    
    if not use_ssl:
        return None
    
    ssl_options = {
        'ssl_version': getattr(ssl, os.environ.get('RABBITMQ_SSL_PROTOCOL', 'PROTOCOL_TLSv1_2')),
        'cert_reqs': ssl.CERT_REQUIRED if os.environ.get('RABBITMQ_VERIFY_PEER', 'true').lower() == 'true' else ssl.CERT_NONE,
    }
    
    # Optional certificate paths for self-signed or custom CA
    ca_cert = os.environ.get('RABBITMQ_SSL_CACERT')
    client_cert = os.environ.get('RABBITMQ_SSL_CERTFILE')
    client_key = os.environ.get('RABBITMQ_SSL_KEYFILE')
    
    if ca_cert and os.path.exists(ca_cert):
        ssl_options['ca_certs'] = ca_cert
    
    if client_cert and os.path.exists(client_cert):
        ssl_options['certfile'] = client_cert
        
    if client_key and os.path.exists(client_key):
        ssl_options['keyfile'] = client_key
    
    logger.info(f"SSL/TLS enabled for RabbitMQ connection with verify_peer={ssl_options['cert_reqs'] == ssl.CERT_REQUIRED}")
    return ssl_options


def get_broker_transport_options() -> Dict[str, Any]:
    """Get broker transport options including SSL configuration."""
    transport_options = {
        'confirm_publish': True,
        'max_retries': 5,
        'interval_start': 0,
        'interval_step': 0.2,
        'interval_max': 1,
    }
    
    # Add SSL options if enabled
    ssl_options = get_ssl_options()
    if ssl_options:
        transport_options['ssl'] = ssl_options
        
    # Connection pool settings for better performance
    transport_options.update({
        'max_connections': int(os.environ.get('CELERY_BROKER_POOL_LIMIT', '10')),
        'heartbeat': int(os.environ.get('RABBITMQ_HEARTBEAT', '60')),
        'connection_timeout': int(os.environ.get('RABBITMQ_CONNECTION_TIMEOUT', '30')),
    })
    
    return transport_options


def get_celery_config() -> Dict[str, Any]:
    """Get Celery configuration with environment overrides and TLS support."""
    
    # Broker configuration - supports both AMQP and AMQPS
    broker_url = os.environ.get(
        'CELERY_BROKER_URL',
        'amqp://ml:ml_password@localhost:5672/'
    )
    
    # Log the broker URL (without password) for debugging
    if broker_url:
        safe_url = broker_url.replace(broker_url.split('@')[0].split('://')[-1], 'ml:****')
        logger.info(f"Broker URL configured: {safe_url}")
    
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
        
        # Transport options including SSL/TLS support
        'broker_transport_options': get_broker_transport_options(),
        
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
                'ml.transcribe_local',
                ml_exchange,
                routing_key='ml.transcribe_local',
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
                'ml.summarize_local',
                ml_exchange,
                routing_key='ml.summarize_local',
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
            'llm_service.tasks.summarize_content_local': {'queue': 'ml.summarize_local'},
            'whisper.tasks.transcribe_api': {'queue': 'ml.transcribe'},
            'whisper.tasks.transcribe_local': {'queue': 'ml.transcribe_local'},
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