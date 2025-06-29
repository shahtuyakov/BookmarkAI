"""
Celery application instance for LLM service.
"""
from bookmarkai_shared.celery_app import create_celery_app
from bookmarkai_shared.tracing import initialize_tracing

# Initialize OpenTelemetry tracing
initialize_tracing('llm-service')

# Create the Celery app
app = create_celery_app('llm_service')

# Import tasks to register them
from . import tasks  # noqa: F401

if __name__ == '__main__':
    app.start()