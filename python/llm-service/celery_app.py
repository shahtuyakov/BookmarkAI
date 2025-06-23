"""Celery app configuration for LLM service."""

import sys
import os

# Add parent directory to path so we can import common
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.celery_app import celery_app

# Import tasks to register them
# Use direct import to avoid module resolution issues
from tasks import *

# The celery app is already configured in common
# We just need to make sure tasks are imported
app = celery_app

# Debug: Print registered tasks
print(f"[DEBUG] Registered tasks: {list(celery_app.tasks.keys())}")
print(f"[DEBUG] Task routes: {celery_app.conf.task_routes}")
print(f"[DEBUG] Task queues: {[q.name for q in celery_app.conf.task_queues]}")
print("[DEBUG] Celery app initialization complete")