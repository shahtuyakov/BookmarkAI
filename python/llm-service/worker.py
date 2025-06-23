#!/usr/bin/env python3
"""Custom worker startup script that bypasses Celery's problematic initialization."""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from celery import Celery
from celery.bin import worker

# Import our configured app
from common.celery_app import celery_app

# Import tasks to register them
from tasks import *

# Override worker command line args to force disable mingle
class CustomWorker(worker.worker):
    def add_arguments(self, parser):
        super().add_arguments(parser)
        # Force these defaults
        parser.set_defaults(
            without_gossip=True,
            without_mingle=True,
            without_heartbeat=True,
            pool='solo',
        )

if __name__ == '__main__':
    print("[WORKER] Starting custom worker with mingle disabled...")
    # Create custom worker instance
    worker_instance = CustomWorker(app=celery_app)
    
    # Start with our custom arguments
    worker_instance.execute_from_commandline([
        'worker',
        '-Q', 'ml.summarize',
        '--loglevel=info',
        '--without-gossip',
        '--without-mingle', 
        '--without-heartbeat',
        '--pool=solo',
    ])