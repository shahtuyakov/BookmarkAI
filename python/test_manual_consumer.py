#!/usr/bin/env python3
"""Manual RabbitMQ consumer to bypass Celery worker issues."""

import json
import sys
import os
from kombu import Connection, Queue, Exchange

# Configuration
RABBITMQ_URL = f"amqp://ml:ml_password@{os.getenv('RABBITMQ_HOST', 'localhost')}:5672//"

# Create connection and channel
print("[DEBUG] Connecting to RabbitMQ...")
conn = Connection(RABBITMQ_URL)
conn.ensure_connection(max_retries=3)
print("[DEBUG] Connected successfully")

# Declare exchange and queue
channel = conn.channel()
exchange = Exchange('ml.tasks', type='topic', durable=True)
queue = Queue('ml.summarize', exchange=exchange, routing_key='summarize_llm')

# Bind and declare
queue = queue.bind(channel)
queue.declare()
print(f"[DEBUG] Queue 'ml.summarize' declared successfully")

def process_message(body, message):
    """Process a message from the queue."""
    print(f"[CONSUMER] Received message: {json.dumps(body, indent=2)}")
    # Acknowledge the message
    message.ack()
    print("[CONSUMER] Message acknowledged")

# Create consumer
with conn.Consumer(queue, callbacks=[process_message]) as consumer:
    print("[CONSUMER] Waiting for messages... Press Ctrl+C to exit")
    try:
        while True:
            conn.drain_events()
    except KeyboardInterrupt:
        print("[CONSUMER] Shutting down...")

conn.close()
print("[DEBUG] Connection closed")