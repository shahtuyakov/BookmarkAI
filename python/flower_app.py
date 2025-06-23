"""Flower app configuration."""

import sys
import os

# Add parent directory to path so we can import common
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from common.celery_app import celery_app

# Export the app for Flower
app = celery_app