"""
Contract validation utilities and decorators
"""
import os
import logging
from functools import wraps
from typing import Type, Union, Callable, Any
from pydantic import BaseModel, ValidationError

from .base import MLTaskType
from .summarization import SummarizationTask
from .transcription import TranscriptionTask
from .embedding import EmbeddingTask, BatchEmbeddingTask

logger = logging.getLogger(__name__)

# Mapping of task types to their corresponding models
TASK_TYPE_TO_MODEL = {
    MLTaskType.SUMMARIZE_LLM: SummarizationTask,
    MLTaskType.TRANSCRIBE_WHISPER: TranscriptionTask,
    MLTaskType.EMBED_VECTORS: EmbeddingTask,
}


def get_task_model(task_type: str, is_batch: bool = False) -> Type[BaseModel]:
    """Get the appropriate Pydantic model for a task type"""
    if task_type == MLTaskType.EMBED_VECTORS and is_batch:
        return BatchEmbeddingTask
    
    return TASK_TYPE_TO_MODEL.get(MLTaskType(task_type))


def validate_contract(
    model: Type[BaseModel] = None,
    enabled_env_var: str = "ENABLE_CONTRACT_VALIDATION",
    log_only: bool = False
) -> Callable:
    """
    Decorator to validate Celery task arguments against Pydantic models
    
    Args:
        model: Pydantic model class to validate against (optional)
        enabled_env_var: Environment variable to check for enabling validation
        log_only: If True, only log validation errors without raising exceptions
    
    Example:
        @app.task
        @validate_contract(SummarizationTask)
        def summarize_content(self, share_id: str, content: dict, options: dict):
            # Task implementation
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Check if validation is enabled
            if os.getenv(enabled_env_var, "false").lower() != "true":
                return func(*args, **kwargs)
            
            # Extract task data from kwargs
            share_id = kwargs.get("share_id", "")
            content = kwargs.get("content", {})
            options = kwargs.get("options", {})
            
            # Construct the full task payload
            task_data = {
                "version": "1.0",
                "share_id": share_id,
                "payload": {
                    "content": content,
                    "options": options
                },
                "metadata": {
                    "correlationId": kwargs.get("correlation_id", None),
                    "timestamp": kwargs.get("timestamp", None),
                    "retryCount": kwargs.get("retry_count", 0),
                    "traceparent": kwargs.get("traceparent", None),
                    "tracestate": kwargs.get("tracestate", None),
                }
            }
            
            # Determine the model to use
            validation_model = model
            if not validation_model:
                # Try to infer from function name
                if "summarize" in func.__name__:
                    validation_model = SummarizationTask
                    task_data["taskType"] = MLTaskType.SUMMARIZE_LLM
                elif "transcribe" in func.__name__:
                    validation_model = TranscriptionTask
                    task_data["taskType"] = MLTaskType.TRANSCRIBE_WHISPER
                elif "embed" in func.__name__:
                    # Check if it's a batch task
                    if kwargs.get("tasks"):
                        validation_model = BatchEmbeddingTask
                        task_data["payload"] = {
                            "tasks": kwargs["tasks"],
                            "isBatch": True
                        }
                        task_data["share_id"] = f"batch-{share_id}" if not share_id.startswith("batch-") else share_id
                    else:
                        validation_model = EmbeddingTask
                    task_data["taskType"] = MLTaskType.EMBED_VECTORS
                else:
                    logger.warning(f"Could not infer task type for function {func.__name__}")
                    return func(*args, **kwargs)
            
            # Validate the task data
            try:
                validated_task = validation_model(**task_data)
                logger.debug(f"Contract validation passed for {func.__name__}")
                
                # Optionally update kwargs with validated data
                if hasattr(validated_task, "payload"):
                    if hasattr(validated_task.payload, "content"):
                        kwargs["content"] = validated_task.payload.content.dict()
                    if hasattr(validated_task.payload, "options") and validated_task.payload.options:
                        kwargs["options"] = validated_task.payload.options.dict()
                
            except ValidationError as e:
                error_msg = f"Contract validation failed for {func.__name__}: {e}"
                logger.error(error_msg)
                logger.error(f"Validation errors: {e.errors()}")
                
                if not log_only:
                    raise ValueError(error_msg) from e
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def validate_task_payload(task_type: str, payload: dict, is_batch: bool = False) -> Union[BaseModel, None]:
    """
    Validate a task payload against its corresponding model
    
    Args:
        task_type: The task type string
        payload: The complete task payload dictionary
        is_batch: Whether this is a batch task
        
    Returns:
        Validated Pydantic model instance or None if validation fails
    """
    try:
        model = get_task_model(task_type, is_batch)
        if not model:
            logger.error(f"Unknown task type: {task_type}")
            return None
            
        return model(**payload)
    except ValidationError as e:
        logger.error(f"Validation failed for {task_type}: {e}")
        return None