"""Celery app configuration for Whisper service."""

import sys
import os

# Add parent directory to path so we can import common
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.celery_app import celery_app

# Import tasks to register them
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tasks

# The celery app is already configured in common
# We just need to make sure tasks are imported
app = celery_app