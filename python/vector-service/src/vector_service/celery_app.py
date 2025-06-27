"""
Celery application configuration for the vector embedding service.
"""

import os
import logging
from celery import Celery
from celery.signals import worker_ready, worker_process_init
from dotenv import load_dotenv
from bookmarkai_shared.celery_app import create_celery_app

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create Celery app with shared configuration
app = create_celery_app('vector_service')

# Import tasks to register them
from . import tasks  # noqa

@worker_ready.connect
def on_worker_ready(**kwargs):
    """Initialize worker when ready."""
    logger.info("Vector embedding worker is ready")
    
    # Clear any stale locks on startup
    try:
        from celery_singleton import clear_locks
        from . import tasks  # noqa
        clear_locks(app)
        logger.info("Cleared stale singleton locks")
    except Exception as e:
        logger.error(f"Failed to clear locks: {e}")

@worker_process_init.connect
def on_worker_process_init(**kwargs):
    """Initialize each worker process."""
    logger.info("Initializing vector embedding worker process")
    
    # Set worker type for metrics
    os.environ['WORKER_TYPE'] = 'vector'
    os.environ['SERVICE_NAME'] = 'vector-service'