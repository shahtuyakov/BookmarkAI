"""Configuration management for BookmarkAI ML services."""

import os
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # API Configuration
    api_base_url: str = "http://localhost:3000"
    api_key: str = "test-api-key"
    
    # Database
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "bookmarkai"
    postgres_password: str = "bookmarkai"
    postgres_db: str = "bookmarkai"
    postgres_schema: str = "public"
    
    # Connection pool settings
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 30
    db_pool_recycle: int = 3600
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_max_connections: int = 50
    
    # Celery
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    celery_task_serializer: str = "json"
    celery_result_serializer: str = "json"
    celery_accept_content: list[str] = Field(default_factory=lambda: ["json"])
    celery_timezone: str = "UTC"
    celery_enable_utc: bool = True
    
    # Task routing
    task_routes: dict = Field(default_factory=lambda: {
        "caption_service.tasks.*": {"queue": "caption"},
        "llm_service.tasks.*": {"queue": "llm"},
        "vector_service.tasks.*": {"queue": "vector"},
        "whisper_service.tasks.*": {"queue": "whisper"},
    })
    
    # Queue configurations
    task_queues: list[str] = Field(
        default_factory=lambda: ["caption", "llm", "vector", "whisper", "default"]
    )
    
    # S3/MinIO Configuration
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"
    s3_use_path_style: bool = True
    s3_bucket_media: str = "bookmarkai-media"
    
    # OpenAI settings
    openai_api_key: str = Field(default="", env="OPENAI_API_KEY")
    embedding_model: str = "text-embedding-3-small"
    summary_model: str = "gpt-4o-mini"
    whisper_model: str = "whisper-1"
    
    # Worker settings
    worker_prefetch_multiplier: int = 1
    task_time_limit: int = 300  # 5 minutes
    task_soft_time_limit: int = 270  # 4.5 minutes
    
    # Observability
    otel_service_name: str = "bookmarkai-ml"
    otel_exporter_otlp_endpoint: str = "http://tempo:4318"
    log_level: str = "INFO"


settings = Settings()