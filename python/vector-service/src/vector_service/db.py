"""
Database operations for vector embeddings.
Handles storage of embeddings, cost tracking, and budget management.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple
from decimal import Decimal
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager
import numpy as np

from .models import EmbeddingResult

logger = logging.getLogger(__name__)


class DatabaseError(Exception):
    """Custom exception for database operations."""
    pass


class BudgetExceededError(Exception):
    """Exception raised when cost would exceed budget limits."""
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
        # Register the vector type
        conn.cursor().execute("CREATE EXTENSION IF NOT EXISTS vector;")
        conn.commit()
        yield conn
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        raise DatabaseError(f"Failed to connect to database: {e}")
    finally:
        if conn:
            conn.close()


def save_embedding_result(
    result: EmbeddingResult,
    share_id: str,
    metadata: Dict[str, Any]
) -> None:
    """
    Save embedding results to database.
    Stores metadata in ml_results and vectors in embeddings table.
    
    Args:
        result: Embedding result with vectors and metadata
        share_id: Share ID
        metadata: Additional metadata
        
    Raises:
        DatabaseError: If save fails
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Start transaction
                conn.autocommit = False
                
                try:
                    # 1. Save to ml_results table
                    ml_result_data = {
                        'embeddings_count': len(result.embeddings),
                        'model': result.model,
                        'total_tokens': result.total_tokens,
                        'total_cost': float(result.total_cost),
                        'chunks': [
                            {
                                'chunk_index': emb['metadata']['chunk_index'],
                                'total_chunks': emb['metadata']['total_chunks'],
                                'token_count': emb['token_count'],
                                'start_offset': emb['metadata'].get('start_offset'),
                                'end_offset': emb['metadata'].get('end_offset'),
                                'start_time': emb['metadata'].get('start_time'),
                                'end_time': emb['metadata'].get('end_time'),
                                'content_hash': emb['metadata']['content_hash']
                            }
                            for emb in result.embeddings
                        ]
                    }
                    
                    cursor.execute("""
                        INSERT INTO ml_results (share_id, task_type, result_data, model_version, processing_ms)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (share_id, task_type) 
                        DO UPDATE SET 
                            result_data = EXCLUDED.result_data,
                            model_version = EXCLUDED.model_version,
                            processing_ms = EXCLUDED.processing_ms,
                            created_at = CURRENT_TIMESTAMP
                    """, (
                        share_id,
                        'embed_vectors',
                        Json(ml_result_data),
                        result.model,
                        result.processing_time_ms
                    ))
                    
                    # 2. Delete existing embeddings for this share (if any)
                    cursor.execute("""
                        DELETE FROM embeddings WHERE share_id = %s
                    """, (share_id,))
                    
                    # 3. Insert new embeddings
                    for emb in result.embeddings:
                        vector = emb['embedding']
                        emb_metadata = emb['metadata']
                        
                        # Convert to numpy array and then to PostgreSQL vector format
                        vector_str = '[' + ','.join(map(str, vector)) + ']'
                        
                        cursor.execute("""
                            INSERT INTO embeddings (
                                share_id, 
                                embedding, 
                                dimensions,
                                created_at
                            ) VALUES (
                                %s, %s::vector, %s, CURRENT_TIMESTAMP
                            )
                        """, (
                            share_id,
                            vector_str,
                            emb['dimensions']
                        ))
                    
                    # 4. Track cost (will be implemented in task vector-6)
                    try:
                        track_vector_cost(
                            share_id=share_id,
                            model=result.model,
                            input_tokens=result.total_tokens,
                            cost=result.total_cost,
                            chunks_generated=len(result.embeddings)
                        )
                    except Exception as e:
                        logger.warning(f"Failed to track cost: {e}")
                        # Don't fail the whole operation if cost tracking fails
                    
                    conn.commit()
                    logger.info(
                        f"Saved {len(result.embeddings)} embeddings for share {share_id} "
                        f"({result.total_tokens} tokens, ${result.total_cost:.6f})"
                    )
                    
                except Exception as e:
                    conn.rollback()
                    raise e
                    
    except psycopg2.Error as e:
        logger.error(f"Failed to save embeddings: {e}")
        raise DatabaseError(f"Failed to save embeddings: {e}")


def get_embeddings(share_id: str) -> Optional[List[Dict[str, Any]]]:
    """
    Retrieve embeddings for a share.
    
    Args:
        share_id: Share ID
        
    Returns:
        List of embedding records or None if not found
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        e.id,
                        e.embedding::text as embedding,
                        e.dimensions,
                        e.created_at,
                        mr.result_data
                    FROM embeddings e
                    LEFT JOIN ml_results mr ON e.share_id = mr.share_id 
                        AND mr.task_type = 'embed_vectors'
                    WHERE e.share_id = %s
                    ORDER BY e.created_at
                """, (share_id,))
                
                rows = cursor.fetchall()
                if not rows:
                    return None
                
                # Get chunk metadata from ml_results if available
                chunk_metadata = {}
                if rows[0]['result_data'] and 'chunks' in rows[0]['result_data']:
                    for chunk in rows[0]['result_data']['chunks']:
                        chunk_metadata[chunk['chunk_index']] = chunk
                
                # Parse embeddings
                embeddings = []
                for i, row in enumerate(rows):
                    # Parse vector from string format
                    vector_str = row['embedding']
                    vector = [float(x) for x in vector_str.strip('[]').split(',')]
                    
                    # Get metadata from ml_results or use defaults
                    meta = chunk_metadata.get(i, {})
                    
                    embeddings.append({
                        'id': str(row['id']),
                        'embedding': vector,
                        'dimensions': row['dimensions'],
                        'chunk_index': meta.get('chunk_index', i),
                        'total_chunks': meta.get('total_chunks', len(rows)),
                        'content_hash': meta.get('content_hash', ''),
                        'metadata': {
                            'start_offset': meta.get('start_offset'),
                            'end_offset': meta.get('end_offset'),
                            'start_time': meta.get('start_time'),
                            'end_time': meta.get('end_time'),
                            'token_count': meta.get('token_count')
                        },
                        'created_at': row['created_at'].isoformat()
                    })
                
                return embeddings
                
    except psycopg2.Error as e:
        logger.error(f"Failed to retrieve embeddings: {e}")
        raise DatabaseError(f"Failed to retrieve embeddings: {e}")


def get_embedding_result(share_id: str) -> Optional[Dict[str, Any]]:
    """
    Get embedding result from ml_results table.
    
    Args:
        share_id: Share ID
        
    Returns:
        Result data or None if not found
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        result_data,
                        model_version,
                        processing_ms,
                        created_at
                    FROM ml_results
                    WHERE share_id = %s AND task_type = 'embed_vectors'
                """, (share_id,))
                
                row = cursor.fetchone()
                if not row:
                    return None
                
                return {
                    'result_data': row['result_data'],
                    'model': row['model_version'],
                    'processing_ms': row['processing_ms'],
                    'created_at': row['created_at'].isoformat()
                }
                
    except psycopg2.Error as e:
        logger.error(f"Failed to get embedding result: {e}")
        raise DatabaseError(f"Failed to get embedding result: {e}")


def find_similar_embeddings(
    query_vector: List[float],
    limit: int = 10,
    threshold: float = 0.8,
    content_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Find similar embeddings using cosine similarity.
    
    Args:
        query_vector: Query embedding vector
        limit: Maximum number of results
        threshold: Minimum similarity score (0-1)
        content_type: Optional filter by content type
        
    Returns:
        List of similar embeddings with scores
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Convert query vector to PostgreSQL format
                vector_str = '[' + ','.join(map(str, query_vector)) + ']'
                
                # Build query with optional content type filter
                query = """
                    SELECT 
                        e.share_id,
                        e.id as embedding_id,
                        s.url,
                        s.title,
                        s.content_type,
                        mr.result_data,
                        1 - (e.embedding <=> %s::vector) as similarity
                    FROM embeddings e
                    JOIN shares s ON e.share_id = s.id
                    LEFT JOIN ml_results mr ON e.share_id = mr.share_id 
                        AND mr.task_type = 'embed_vectors'
                    WHERE 1 - (e.embedding <=> %s::vector) >= %s
                """
                
                params = [vector_str, vector_str, threshold]
                
                if content_type:
                    query += " AND s.content_type = %s"
                    params.append(content_type)
                
                query += """
                    ORDER BY similarity DESC
                    LIMIT %s
                """
                params.append(limit)
                
                cursor.execute(query, params)
                
                results = []
                for row in cursor.fetchall():
                    # Extract chunk metadata from result_data if available
                    chunk_info = {}
                    if row['result_data'] and 'chunks' in row['result_data']:
                        # Find chunk info (simplified - in real app might need better matching)
                        chunk_info = row['result_data']['chunks'][0] if row['result_data']['chunks'] else {}
                    
                    results.append({
                        'share_id': str(row['share_id']),
                        'embedding_id': str(row['embedding_id']),
                        'chunk_index': chunk_info.get('chunk_index', 0),
                        'content_hash': chunk_info.get('content_hash', ''),
                        'metadata': {
                            'start_offset': chunk_info.get('start_offset'),
                            'end_offset': chunk_info.get('end_offset'),
                            'start_time': chunk_info.get('start_time'),
                            'end_time': chunk_info.get('end_time')
                        },
                        'share_url': row['url'],
                        'share_title': row['title'],
                        'content_type': row['content_type'],
                        'similarity': float(row['similarity'])
                    })
                
                return results
                
    except psycopg2.Error as e:
        logger.error(f"Failed to find similar embeddings: {e}")
        raise DatabaseError(f"Failed to find similar embeddings: {e}")


# Cost tracking functions
def track_vector_cost(
    share_id: str,
    model: str,
    input_tokens: int,
    cost: float,
    chunks_generated: int
) -> None:
    """
    Track embedding generation costs in vector_costs table.
    
    Args:
        share_id: Share ID
        model: Model name used
        input_tokens: Total tokens processed
        cost: Total cost in USD
        chunks_generated: Number of chunks/embeddings generated
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO vector_costs (
                        share_id,
                        model,
                        input_tokens,
                        chunks_generated,
                        total_cost,
                        cost_per_token,
                        created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP
                    )
                """, (
                    share_id,
                    model,
                    input_tokens,
                    chunks_generated,
                    cost,
                    cost / input_tokens if input_tokens > 0 else 0
                ))
                
                conn.commit()
                logger.info(
                    f"Tracked vector cost: {model} - {input_tokens} tokens - "
                    f"{chunks_generated} chunks - ${cost:.6f}"
                )
                
    except psycopg2.Error as e:
        # Log error but don't fail the main operation
        logger.error(f"Failed to track vector cost: {e}")


def check_budget_limits(
    estimated_cost: float,
    estimated_tokens: int = 0
) -> Tuple[bool, Optional[str]]:
    """
    Check if estimated cost would exceed budget limits.
    
    Args:
        estimated_cost: Estimated cost for the operation
        estimated_tokens: Estimated tokens (optional)
        
    Returns:
        Tuple of (is_within_budget, error_message)
    """
    # Get budget limits from environment
    hourly_limit = float(os.getenv('VECTOR_HOURLY_COST_LIMIT', '1.0'))
    daily_limit = float(os.getenv('VECTOR_DAILY_COST_LIMIT', '10.0'))
    strict_mode = os.getenv('VECTOR_BUDGET_STRICT_MODE', 'false').lower() == 'true'
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Check hourly spending
                cursor.execute("""
                    SELECT COALESCE(SUM(total_cost), 0) as hourly_cost
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                """)
                hourly_cost = float(cursor.fetchone()['hourly_cost'])
                
                if hourly_cost + estimated_cost > hourly_limit:
                    msg = (
                        f"Hourly budget exceeded: ${hourly_cost:.4f} + ${estimated_cost:.4f} "
                        f"would exceed ${hourly_limit:.2f} limit"
                    )
                    if strict_mode:
                        return False, msg
                    else:
                        logger.warning(msg)
                
                # Check daily spending
                cursor.execute("""
                    SELECT COALESCE(SUM(total_cost), 0) as daily_cost
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                """)
                daily_cost = float(cursor.fetchone()['daily_cost'])
                
                if daily_cost + estimated_cost > daily_limit:
                    msg = (
                        f"Daily budget exceeded: ${daily_cost:.4f} + ${estimated_cost:.4f} "
                        f"would exceed ${daily_limit:.2f} limit"
                    )
                    if strict_mode:
                        return False, msg
                    else:
                        logger.warning(msg)
                
                # Log current usage
                logger.info(
                    f"Budget check passed - Hourly: ${hourly_cost:.4f}/${hourly_limit:.2f}, "
                    f"Daily: ${daily_cost:.4f}/${daily_limit:.2f}, "
                    f"Estimated: ${estimated_cost:.4f} ({estimated_tokens} tokens)"
                )
                
                return True, None
                
    except psycopg2.Error as e:
        logger.error(f"Failed to check budget limits: {e}")
        # If we can't check, allow by default (unless strict mode)
        if strict_mode:
            return False, f"Failed to verify budget: {str(e)}"
        return True, None


def get_budget_status() -> Dict[str, Any]:
    """
    Get current budget status for vector embeddings.
    
    Returns:
        Dictionary with current budget usage and limits
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Get current spending
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(CASE 
                            WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour' 
                            THEN total_cost ELSE 0 
                        END), 0) as hourly_cost,
                        COALESCE(SUM(CASE 
                            WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' 
                            THEN total_cost ELSE 0 
                        END), 0) as daily_cost,
                        COUNT(CASE 
                            WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour' 
                            THEN 1 ELSE NULL 
                        END) as hourly_requests,
                        COUNT(CASE 
                            WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' 
                            THEN 1 ELSE NULL 
                        END) as daily_requests
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                """)
                
                result = cursor.fetchone()
                
                hourly_limit = float(os.getenv('VECTOR_HOURLY_COST_LIMIT', '1.0'))
                daily_limit = float(os.getenv('VECTOR_DAILY_COST_LIMIT', '10.0'))
                
                hourly_cost = float(result['hourly_cost'])
                daily_cost = float(result['daily_cost'])
                
                return {
                    'hourly': {
                        'used': hourly_cost,
                        'limit': hourly_limit,
                        'remaining': max(0, hourly_limit - hourly_cost),
                        'percentage': (hourly_cost / hourly_limit * 100) if hourly_limit > 0 else 0,
                        'requests': result['hourly_requests']
                    },
                    'daily': {
                        'used': daily_cost,
                        'limit': daily_limit,
                        'remaining': max(0, daily_limit - daily_cost),
                        'percentage': (daily_cost / daily_limit * 100) if daily_limit > 0 else 0,
                        'requests': result['daily_requests']
                    },
                    'strict_mode': os.getenv('VECTOR_BUDGET_STRICT_MODE', 'false').lower() == 'true'
                }
                
    except psycopg2.Error as e:
        logger.error(f"Failed to get budget status: {e}")
        return {
            'error': str(e),
            'hourly': {'used': 0, 'limit': 1.0, 'remaining': 1.0, 'percentage': 0},
            'daily': {'used': 0, 'limit': 10.0, 'remaining': 10.0, 'percentage': 0}
        }


def get_cost_summary(
    time_window: str = '24h',
    group_by: str = 'hour'
) -> Dict[str, Any]:
    """
    Get cost summary for vector embeddings.
    
    Args:
        time_window: Time window ('1h', '24h', '7d', '30d')
        group_by: Grouping ('hour', 'day', 'model')
        
    Returns:
        Dictionary with cost analytics
    """
    # Parse time window
    interval_map = {
        '1h': '1 hour',
        '24h': '24 hours',
        '7d': '7 days',
        '30d': '30 days'
    }
    interval = interval_map.get(time_window, '24 hours')
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Get total summary
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total_requests,
                        SUM(input_tokens) as total_tokens,
                        SUM(chunks_generated) as total_chunks,
                        SUM(total_cost) as total_cost,
                        AVG(total_cost) as avg_cost,
                        AVG(cost_per_token * 1000) as avg_cost_per_1k_tokens
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL %s
                """, (interval,))
                
                summary = cursor.fetchone()
                
                # Get breakdown by model
                cursor.execute("""
                    SELECT 
                        model,
                        COUNT(*) as requests,
                        SUM(input_tokens) as tokens,
                        SUM(chunks_generated) as chunks,
                        SUM(total_cost) as cost
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL %s
                    GROUP BY model
                    ORDER BY cost DESC
                """, (interval,))
                
                by_model = {}
                for row in cursor.fetchall():
                    by_model[row['model']] = {
                        'requests': row['requests'],
                        'tokens': row['tokens'] or 0,
                        'chunks': row['chunks'] or 0,
                        'cost': float(row['cost'] or 0)
                    }
                
                # Get time series data
                time_series = []
                if group_by == 'hour':
                    cursor.execute("""
                        SELECT 
                            DATE_TRUNC('hour', created_at) as period,
                            COUNT(*) as requests,
                            SUM(input_tokens) as tokens,
                            SUM(chunks_generated) as chunks,
                            SUM(total_cost) as cost
                        FROM vector_costs
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL %s
                        GROUP BY DATE_TRUNC('hour', created_at)
                        ORDER BY period DESC
                        LIMIT 48
                    """, (interval,))
                elif group_by == 'day':
                    cursor.execute("""
                        SELECT 
                            DATE_TRUNC('day', created_at) as period,
                            COUNT(*) as requests,
                            SUM(input_tokens) as tokens,
                            SUM(chunks_generated) as chunks,
                            SUM(total_cost) as cost
                        FROM vector_costs
                        WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL %s
                        GROUP BY DATE_TRUNC('day', created_at)
                        ORDER BY period DESC
                        LIMIT 30
                    """, (interval,))
                
                for row in cursor.fetchall():
                    time_series.append({
                        'period': row['period'].isoformat(),
                        'requests': row['requests'],
                        'tokens': row['tokens'] or 0,
                        'chunks': row['chunks'] or 0,
                        'cost': float(row['cost'] or 0)
                    })
                
                # Get current budget usage
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(total_cost), 0) as hourly_cost
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
                """)
                hourly_cost = float(cursor.fetchone()['hourly_cost'])
                
                cursor.execute("""
                    SELECT 
                        COALESCE(SUM(total_cost), 0) as daily_cost
                    FROM vector_costs
                    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
                """)
                daily_cost = float(cursor.fetchone()['daily_cost'])
                
                return {
                    'time_window': time_window,
                    'group_by': group_by,
                    'total_requests': summary['total_requests'] or 0,
                    'total_tokens': summary['total_tokens'] or 0,
                    'total_chunks': summary['total_chunks'] or 0,
                    'total_cost': float(summary['total_cost'] or 0),
                    'avg_cost': float(summary['avg_cost'] or 0),
                    'avg_cost_per_1k_tokens': float(summary['avg_cost_per_1k_tokens'] or 0),
                    'by_model': by_model,
                    'time_series': time_series,
                    'budget_usage': {
                        'hourly': {
                            'used': hourly_cost,
                            'limit': float(os.getenv('VECTOR_HOURLY_COST_LIMIT', '1.0')),
                            'percentage': (hourly_cost / float(os.getenv('VECTOR_HOURLY_COST_LIMIT', '1.0'))) * 100
                        },
                        'daily': {
                            'used': daily_cost,
                            'limit': float(os.getenv('VECTOR_DAILY_COST_LIMIT', '10.0')),
                            'percentage': (daily_cost / float(os.getenv('VECTOR_DAILY_COST_LIMIT', '10.0'))) * 100
                        }
                    }
                }
                
    except psycopg2.Error as e:
        logger.error(f"Failed to get cost summary: {e}")
        return {
            'error': str(e),
            'time_window': time_window,
            'group_by': group_by
        }