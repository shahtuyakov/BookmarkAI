"""Database utilities for ML services."""

import json
from contextlib import contextmanager
from datetime import datetime
from typing import Any, Dict, Generator, Optional
from uuid import UUID

import psycopg2
from psycopg2.extras import RealDictCursor, Json
from psycopg2.pool import SimpleConnectionPool

from .config import settings


# Create connection pool
_connection_pool: Optional[SimpleConnectionPool] = None


def get_connection_pool() -> SimpleConnectionPool:
    """Get or create the database connection pool."""
    global _connection_pool
    
    if _connection_pool is None:
        _connection_pool = SimpleConnectionPool(
            1,  # min connections
            10,  # max connections
            host=settings.postgres_host,
            port=settings.postgres_port,
            database=settings.postgres_db,
            user=settings.postgres_user,
            password=settings.postgres_password,
        )
    
    return _connection_pool


@contextmanager
def get_db_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """Get a database connection from the pool."""
    pool = get_connection_pool()
    conn = pool.getconn()
    
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def save_ml_result(
    share_id: UUID,
    task_type: str,
    result_data: Dict[str, Any],
    model_version: str,
    processing_ms: int,
) -> None:
    """Save ML processing result to database."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO ml_results (
                    share_id, task_type, result_data, 
                    model_version, processing_ms, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (share_id, task_type) 
                DO UPDATE SET
                    result_data = EXCLUDED.result_data,
                    model_version = EXCLUDED.model_version,
                    processing_ms = EXCLUDED.processing_ms,
                    created_at = EXCLUDED.created_at
                """,
                (
                    str(share_id),
                    task_type,
                    Json(result_data),
                    model_version,
                    processing_ms,
                    datetime.utcnow(),
                ),
            )


def get_ml_result(share_id: UUID, task_type: str) -> Optional[Dict[str, Any]]:
    """Get ML processing result from database."""
    with get_db_connection() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT * FROM ml_results
                WHERE share_id = %s AND task_type = %s
                """,
                (str(share_id), task_type),
            )
            result = cursor.fetchone()
            
            if result:
                # Convert to dict and ensure JSON types
                return dict(result)
            
            return None


def update_share_status(share_id: UUID, status: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    """Update share processing status."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            if metadata:
                cursor.execute(
                    """
                    UPDATE shares 
                    SET status = %s, 
                        metadata = COALESCE(metadata, '{}'::jsonb) || %s,
                        updated_at = %s
                    WHERE id = %s
                    """,
                    (status, Json(metadata), datetime.utcnow(), str(share_id)),
                )
            else:
                cursor.execute(
                    """
                    UPDATE shares 
                    SET status = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (status, datetime.utcnow(), str(share_id)),
                )