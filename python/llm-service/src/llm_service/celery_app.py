"""
Celery application instance for LLM service.
"""
from bookmarkai_shared.celery_app import create_celery_app

# Create the Celery app
app = create_celery_app('llm_service')

# Import tasks to register them
from . import tasks  # noqa: F401

if __name__ == '__main__':
    app.start()