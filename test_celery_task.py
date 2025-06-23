#!/usr/bin/env python3
"""Test script to send a Celery task properly."""

import sys
import os

# Add the python directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'python'))

from common.celery_app import celery_app
from datetime import datetime
import uuid

# Send a task to the LLM summarization queue
task_id = str(uuid.uuid4())
share_id = str(uuid.uuid4())

# Send the task using Celery's API
result = celery_app.send_task(
    'llm_service.tasks.summarize_llm',
    args=[
        share_id,
        {
            "text": "This is a test text from a TikTok video about AI and machine learning. It's really interesting and covers topics like neural networks, deep learning, and practical applications!",
            "maxTokens": 150,
            "style": "concise"
        },
        {
            "correlationId": f"test-{datetime.now().isoformat()}",
            "timestamp": datetime.now().isoformat(),
            "retryCount": 0
        }
    ],
    task_id=task_id,
    queue='ml.summarize',
    routing_key='summarize_llm'
)

print(f"Sent Celery task with ID: {task_id}")
print(f"Share ID: {share_id}")
print(f"Task state: {result.state}")
print("Check worker logs to see if it's processed!")