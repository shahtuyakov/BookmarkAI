"""Database operations for LLM service."""

import os
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager

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
        yield conn
    except psycopg2.Error as e:
        logger.error(f"Database connection error: {e}")
        raise DatabaseError(f"Failed to connect to database: {e}")
    finally:
        if conn:
            conn.close()


def save_summarization_result(
    share_id: str,
    summary: str,
    model: str,
    provider: str,
    tokens_used: Dict[str, int],
    processing_time_ms: int,
    metadata: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Save summarization result to ml_results table.
    
    Args:
        share_id: Unique identifier for the share
        summary: Generated summary text
        model: Model name used
        provider: Provider used (openai/anthropic)
        tokens_used: Dictionary with input/output tokens
        processing_time_ms: Processing time in milliseconds
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
                    'summary': summary,
                    'model': model,
                    'provider': provider,
                    'input_tokens': tokens_used.get('input', 0),
                    'output_tokens': tokens_used.get('output', 0),
                    'total_tokens': tokens_used.get('total', 0),
                    'processed_at': datetime.utcnow().isoformat(),
                    'status': 'success'
                }
                
                # Add any additional metadata
                if metadata:
                    result_data['metadata'] = metadata
                
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
                    'summarization',
                    Json(result_data),
                    f'{provider}-{model}',
                    processing_time_ms
                ))
                
                row = cur.fetchone()
                conn.commit()
                
                logger.info(
                    f"Saved summarization result for share_id {share_id}: "
                    f"id={row['id']}, tokens={tokens_used.get('total', 0)}"
                )
                
                return {
                    'id': str(row['id']),
                    'share_id': share_id,
                    'created_at': row['created_at'].isoformat(),
                    **result_data
                }
                
        except psycopg2.Error as e:
            conn.rollback()
            logger.error(f"Failed to save summarization result: {e}")
            raise DatabaseError(f"Failed to save summarization result: {e}")


def track_llm_cost(
    share_id: Optional[str],
    model_name: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    input_cost_usd: float,
    output_cost_usd: float,
    backend: str = 'api',
    processing_time_ms: Optional[int] = None
) -> None:
    """Track LLM costs for analytics.
    
    This is a separate table for cost tracking and analytics,
    allowing us to monitor usage patterns and costs over time.
    
    Args:
        share_id: Unique identifier for the share (optional)
        model_name: Model name used
        provider: Provider (openai/anthropic/local)
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        input_cost_usd: Cost for input tokens in USD
        output_cost_usd: Cost for output tokens in USD
        backend: Backend used (api/local)
        processing_time_ms: Processing time in milliseconds
        
    Note:
        This function doesn't raise exceptions to avoid disrupting
        the main summarization flow. Errors are logged instead.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # First check if the table exists (it might not in initial deployment)
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'llm_costs'
                    )
                """)
                
                if not cur.fetchone()['exists']:
                    logger.warning("llm_costs table does not exist yet")
                    return
                
                # Insert cost tracking record
                cur.execute("""
                    INSERT INTO llm_costs (
                        share_id,
                        model_name,
                        provider,
                        input_tokens,
                        output_tokens,
                        input_cost_usd,
                        output_cost_usd,
                        backend,
                        processing_time_ms,
                        created_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP
                    )
                """, (
                    share_id,
                    model_name,
                    provider,
                    input_tokens,
                    output_tokens,
                    input_cost_usd,
                    output_cost_usd,
                    backend,
                    processing_time_ms
                ))
                
                conn.commit()
                total_cost = input_cost_usd + output_cost_usd
                logger.info(
                    f"Tracked LLM cost: share_id={share_id}, model={model_name}, "
                    f"tokens={input_tokens}+{output_tokens}={input_tokens+output_tokens}, "
                    f"cost=${total_cost:.4f}"
                )
                
        except psycopg2.Error as e:
            # Log but don't raise - this is supplementary tracking
            logger.error(f"Failed to track LLM cost: {e}")


def check_budget_limits(estimated_cost: float) -> Dict[str, Any]:
    """Check if processing would exceed budget limits.
    
    Args:
        estimated_cost: Estimated total cost for the upcoming summarization
        
    Returns:
        Dictionary with:
            - allowed: bool - Whether the summarization is allowed
            - reason: str - Reason if not allowed
            - current_hourly_cost: float - Current hour's spending
            - current_daily_cost: float - Current day's spending
            - hourly_limit: float - Hourly limit from env
            - daily_limit: float - Daily limit from env
            
    Raises:
        BudgetExceededError: If the cost would exceed limits (when strict mode enabled)
    """
    # Get budget limits from environment
    hourly_limit = float(os.getenv('LLM_HOURLY_COST_LIMIT', '2.00'))
    daily_limit = float(os.getenv('LLM_DAILY_COST_LIMIT', '20.00'))
    strict_mode = os.getenv('LLM_BUDGET_STRICT_MODE', 'false').lower() == 'true'
    
    # Skip budget checks if limits are set to 0 (unlimited)
    if hourly_limit == 0 and daily_limit == 0:
        return {
            'allowed': True,
            'reason': 'Budget checks disabled',
            'current_hourly_cost': 0,
            'current_daily_cost': 0,
            'hourly_limit': hourly_limit,
            'daily_limit': daily_limit
        }
    
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # Check if costs table exists
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'llm_costs'
                    )
                """)
                
                if not cur.fetchone()['exists']:
                    logger.warning("llm_costs table does not exist, allowing request")
                    return {
                        'allowed': True,
                        'reason': 'Cost tracking not yet initialized',
                        'current_hourly_cost': 0,
                        'current_daily_cost': 0,
                        'hourly_limit': hourly_limit,
                        'daily_limit': daily_limit
                    }
                
                # Get current hourly spending
                cur.execute("""
                    SELECT COALESCE(SUM(total_cost_usd), 0) as hourly_cost
                    FROM llm_costs
                    WHERE created_at >= NOW() - INTERVAL '1 hour'
                    AND backend = 'api'
                """)
                current_hourly_cost = float(cur.fetchone()['hourly_cost'])
                
                # Get current daily spending
                cur.execute("""
                    SELECT COALESCE(SUM(total_cost_usd), 0) as daily_cost
                    FROM llm_costs
                    WHERE created_at >= NOW() - INTERVAL '24 hours'
                    AND backend = 'api'
                """)
                current_daily_cost = float(cur.fetchone()['daily_cost'])
                
                # Check hourly limit
                if hourly_limit > 0 and (current_hourly_cost + estimated_cost) > hourly_limit:
                    result = {
                        'allowed': False,
                        'reason': f'Would exceed hourly limit: ${current_hourly_cost:.2f} + ${estimated_cost:.4f} > ${hourly_limit:.2f}',
                        'current_hourly_cost': current_hourly_cost,
                        'current_daily_cost': current_daily_cost,
                        'hourly_limit': hourly_limit,
                        'daily_limit': daily_limit
                    }
                    if strict_mode:
                        raise BudgetExceededError(result['reason'])
                    return result
                
                # Check daily limit
                if daily_limit > 0 and (current_daily_cost + estimated_cost) > daily_limit:
                    result = {
                        'allowed': False,
                        'reason': f'Would exceed daily limit: ${current_daily_cost:.2f} + ${estimated_cost:.4f} > ${daily_limit:.2f}',
                        'current_hourly_cost': current_hourly_cost,
                        'current_daily_cost': current_daily_cost,
                        'hourly_limit': hourly_limit,
                        'daily_limit': daily_limit
                    }
                    if strict_mode:
                        raise BudgetExceededError(result['reason'])
                    return result
                
                return {
                    'allowed': True,
                    'reason': 'Within budget limits',
                    'current_hourly_cost': current_hourly_cost,
                    'current_daily_cost': current_daily_cost,
                    'hourly_limit': hourly_limit,
                    'daily_limit': daily_limit
                }
                
        except psycopg2.Error as e:
            logger.error(f"Failed to check budget limits: {e}")
            # On error, allow the request but log the issue
            return {
                'allowed': True,
                'reason': f'Budget check failed: {str(e)}',
                'current_hourly_cost': 0,
                'current_daily_cost': 0,
                'hourly_limit': hourly_limit,
                'daily_limit': daily_limit,
                'error': str(e)
            }


def get_llm_cost_summary(hours: int = 24) -> Dict[str, Any]:
    """Get LLM cost summary for the specified time period.
    
    Args:
        hours: Number of hours to look back (default 24)
        
    Returns:
        Dictionary with cost summary statistics by provider and model
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # Check if costs table exists
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'llm_costs'
                    )
                """)
                
                if not cur.fetchone()['exists']:
                    return {
                        'period_hours': hours,
                        'total_cost_usd': 0,
                        'request_count': 0,
                        'message': 'Cost tracking table not yet created'
                    }
                
                # Get overall summary
                cur.execute("""
                    SELECT 
                        COUNT(*) as request_count,
                        COALESCE(SUM(total_tokens), 0) as total_tokens,
                        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                        COALESCE(SUM(total_cost_usd), 0) as total_cost_usd,
                        COALESCE(AVG(total_cost_usd), 0) as avg_cost_per_request,
                        COALESCE(AVG(processing_time_ms), 0) as avg_processing_time_ms
                    FROM llm_costs
                    WHERE created_at >= NOW() - INTERVAL '%s hours'
                    AND backend = 'api'
                """, (hours,))
                
                overall = cur.fetchone()
                
                # Get breakdown by provider and model
                cur.execute("""
                    SELECT 
                        provider,
                        model_name,
                        COUNT(*) as request_count,
                        SUM(total_tokens) as total_tokens,
                        SUM(total_cost_usd) as total_cost_usd,
                        AVG(total_cost_usd) as avg_cost_per_request
                    FROM llm_costs
                    WHERE created_at >= NOW() - INTERVAL '%s hours'
                    AND backend = 'api'
                    GROUP BY provider, model_name
                    ORDER BY total_cost_usd DESC
                """, (hours,))
                
                by_model = []
                for row in cur:
                    by_model.append({
                        'provider': row['provider'],
                        'model': row['model_name'],
                        'request_count': row['request_count'],
                        'total_tokens': int(row['total_tokens']),
                        'total_cost_usd': float(row['total_cost_usd']),
                        'avg_cost_per_request': float(row['avg_cost_per_request'])
                    })
                
                return {
                    'period_hours': hours,
                    'total_cost_usd': float(overall['total_cost_usd']),
                    'total_tokens': int(overall['total_tokens']),
                    'total_input_tokens': int(overall['total_input_tokens']),
                    'total_output_tokens': int(overall['total_output_tokens']),
                    'request_count': overall['request_count'],
                    'avg_cost_per_request': float(overall['avg_cost_per_request']),
                    'avg_processing_time_ms': float(overall['avg_processing_time_ms']),
                    'cost_per_1k_tokens': (
                        float(overall['total_cost_usd']) / (int(overall['total_tokens']) / 1000)
                        if overall['total_tokens'] > 0 else 0
                    ),
                    'by_model': by_model
                }
                
        except psycopg2.Error as e:
            logger.error(f"Failed to get LLM cost summary: {e}")
            return {
                'period_hours': hours,
                'error': str(e)
            }


def get_summarization_result(share_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve summarization result for a share.
    
    Args:
        share_id: Unique identifier for the share
        
    Returns:
        Dictionary with summarization data or None if not found
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
                    WHERE share_id = %s AND task_type = 'summarization'
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
            logger.error(f"Failed to retrieve summarization result: {e}")
            raise DatabaseError(f"Failed to retrieve summarization result: {e}")