"""
Celery application instance for Whisper transcription service.
"""
from bookmarkai_shared.celery_app import create_celery_app
from bookmarkai_shared.tracing import initialize_tracing

# Initialize OpenTelemetry tracing
initialize_tracing('whisper-service')

# Create the Celery app
app = create_celery_app('whisper_service')

# Override specific configuration for whisper service
app.conf.update(
    task_time_limit=900,  # 15 min hard limit for transcription
    task_soft_time_limit=840,  # 14 min soft limit
)

# Import tasks to register them
from . import tasks  # noqa: F401

if __name__ == '__main__':
    app.start()