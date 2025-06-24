"""Database operations for Whisper service."""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager

from .transcription import TranscriptionResult

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Custom exception for database operations."""
    pass


@contextmanager
def get_db_connection():
    """Get PostgreSQL connection with context manager.
    
    Yields:
        psycopg2 connection object
        
    Raises:
        DatabaseError: If connection fails
    """
    conn = None
    try:
        conn = psycopg2.connect(
            host=os.getenv('POSTGRES_HOST', 'localhost'),
            port=os.getenv('POSTGRES_PORT', '5432'),
            database=os.getenv('POSTGRES_DB', 'bookmarkai_dev'),
            user=os.getenv('POSTGRES_USER', 'bookmarkai'),
            password=os.getenv('POSTGRES_PASSWORD', 'bookmarkai_password'),
            cursor_factory=RealDictCursor,
            connect_timeout=10
        )
        yield conn
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        raise DatabaseError(f"Failed to connect to database: {e}")
    finally:
        if conn:
            conn.close()


def save_transcription_result(
    share_id: str,
    result: TranscriptionResult,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Save transcription result to ml_results table.
    
    Args:
        share_id: Unique identifier for the share
        result: TranscriptionResult object
        metadata: Optional additional metadata
        
    Returns:
        Dictionary with saved result data
        
    Raises:
        DatabaseError: If save operation fails
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # Prepare result data
                result_data = {
                    'text': result.text,
                    'segments': [seg.dict() for seg in result.segments],
                    'language': result.language,
                    'duration_seconds': result.duration_seconds,
                    'billing_usd': result.billing_usd,
                    'backend': result.backend,
                    'processed_at': datetime.utcnow().isoformat(),
                    'segment_count': len(result.segments)
                }
                
                # Add any additional metadata
                if metadata:
                    result_data['metadata'] = metadata
                
                # Calculate processing time (approximate based on duration)
                processing_ms = int(result.duration_seconds * 1000 * 0.5)  # Estimate 0.5x realtime
                
                # Insert or update ml_results
                cur.execute("""
                    INSERT INTO ml_results (
                        share_id,
                        task_type,
                        result_data,
                        model_version,
                        processing_ms,
                        created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, CURRENT_TIMESTAMP
                    )
                    ON CONFLICT (share_id, task_type)
                    DO UPDATE SET
                        result_data = EXCLUDED.result_data,
                        model_version = EXCLUDED.model_version,
                        processing_ms = EXCLUDED.processing_ms,
                        created_at = CURRENT_TIMESTAMP
                    RETURNING id, created_at
                """, (
                    share_id,
                    'transcription',
                    Json(result_data),
                    f'whisper-1-{result.backend}',
                    processing_ms
                ))
                
                row = cur.fetchone()
                conn.commit()
                
                logger.info(
                    f"Saved transcription result for share_id {share_id}: "
                    f"id={row['id']}, segments={len(result.segments)}"
                )
                
                return {
                    'id': str(row['id']),
                    'share_id': share_id,
                    'created_at': row['created_at'].isoformat(),
                    **result_data
                }
                
        except psycopg2.Error as e:
            conn.rollback()
            logger.error(f"Failed to save transcription result: {e}")
            raise DatabaseError(f"Failed to save transcription result: {e}")


def track_transcription_cost(
    share_id: str,
    duration_seconds: float,
    billing_usd: float,
    backend: str
) -> None:
    """Track transcription costs for analytics.
    
    This is a separate table for cost tracking and analytics,
    allowing us to monitor usage patterns and costs over time.
    
    Args:
        share_id: Unique identifier for the share
        duration_seconds: Audio duration in seconds
        billing_usd: Cost in USD
        backend: Backend used (api/local)
        
    Note:
        This function doesn't raise exceptions to avoid disrupting
        the main transcription flow. Errors are logged instead.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # First check if the table exists (it might not in initial deployment)
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'transcription_costs'
                    )
                """)
                
                if not cur.fetchone()['exists']:
                    logger.warning("transcription_costs table does not exist yet")
                    return
                
                # Insert cost tracking record
                cur.execute("""
                    INSERT INTO transcription_costs (
                        share_id,
                        audio_duration_seconds,
                        billing_usd,
                        backend,
                        created_at
                    ) VALUES (
                        %s, %s, %s, %s, CURRENT_TIMESTAMP
                    )
                """, (
                    share_id,
                    duration_seconds,
                    billing_usd,
                    backend
                ))
                
                conn.commit()
                logger.info(
                    f"Tracked transcription cost: share_id={share_id}, "
                    f"duration={duration_seconds:.1f}s, cost=${billing_usd:.4f}"
                )
                
        except psycopg2.Error as e:
            # Log but don't raise - this is supplementary tracking
            logger.error(f"Failed to track transcription cost: {e}")


def get_transcription_result(share_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve transcription result for a share.
    
    Args:
        share_id: Unique identifier for the share
        
    Returns:
        Dictionary with transcription data or None if not found
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id,
                        share_id,
                        result_data,
                        model_version,
                        processing_ms,
                        created_at
                    FROM ml_results
                    WHERE share_id = %s AND task_type = 'transcription'
                    ORDER BY created_at DESC
                    LIMIT 1
                """, (share_id,))
                
                row = cur.fetchone()
                if not row:
                    return None
                
                # Merge result_data with other fields
                result = row['result_data']
                result.update({
                    'id': str(row['id']),
                    'share_id': row['share_id'],
                    'model_version': row['model_version'],
                    'processing_ms': row['processing_ms'],
                    'created_at': row['created_at'].isoformat()
                })
                
                return result
                
        except psycopg2.Error as e:
            logger.error(f"Failed to retrieve transcription result: {e}")
            raise DatabaseError(f"Failed to retrieve transcription result: {e}")


def get_cost_summary(hours: int = 24) -> Dict[str, Any]:
    """Get cost summary for the specified time period.
    
    Args:
        hours: Number of hours to look back (default 24)
        
    Returns:
        Dictionary with cost summary statistics
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # Check if costs table exists
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'transcription_costs'
                    )
                """)
                
                if not cur.fetchone()['exists']:
                    return {
                        'period_hours': hours,
                        'total_cost_usd': 0,
                        'total_duration_seconds': 0,
                        'transcription_count': 0,
                        'message': 'Cost tracking table not yet created'
                    }
                
                # Get summary statistics
                cur.execute("""
                    SELECT 
                        COUNT(*) as transcription_count,
                        COALESCE(SUM(audio_duration_seconds), 0) as total_duration_seconds,
                        COALESCE(SUM(billing_usd), 0) as total_cost_usd,
                        COALESCE(AVG(billing_usd), 0) as avg_cost_per_transcription,
                        COALESCE(AVG(audio_duration_seconds), 0) as avg_duration_seconds
                    FROM transcription_costs
                    WHERE created_at >= NOW() - INTERVAL '%s hours'
                    AND backend = 'api'
                """, (hours,))
                
                result = cur.fetchone()
                
                return {
                    'period_hours': hours,
                    'total_cost_usd': float(result['total_cost_usd']),
                    'total_duration_seconds': float(result['total_duration_seconds']),
                    'total_duration_hours': float(result['total_duration_seconds']) / 3600,
                    'transcription_count': result['transcription_count'],
                    'avg_cost_per_transcription': float(result['avg_cost_per_transcription']),
                    'avg_duration_seconds': float(result['avg_duration_seconds']),
                    'cost_per_hour': (
                        float(result['total_cost_usd']) / (float(result['total_duration_seconds']) / 3600)
                        if result['total_duration_seconds'] > 0 else 0
                    )
                }
                
        except psycopg2.Error as e:
            logger.error(f"Failed to get cost summary: {e}")
            return {
                'period_hours': hours,
                'error': str(e)
            }