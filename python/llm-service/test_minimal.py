"""Test minimal Celery configuration."""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from common.celery_minimal import celery_app

@celery_app.task(name="llm_service.tasks.summarize_llm")
def test_summarize(shareId, payload, metadata):
    """Test task."""
    print(f"[TASK] Processing share {shareId}")
    return {"success": True, "shareId": shareId}

if __name__ == "__main__":
    print("[TEST] Starting minimal worker...")
    celery_app.worker_main([
        'worker',
        '-Q', 'ml.summarize',
        '--loglevel=info',
        '--pool=solo',
    ])