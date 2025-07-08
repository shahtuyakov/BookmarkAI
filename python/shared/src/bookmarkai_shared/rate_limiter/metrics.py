"""
Rate limiter metrics for monitoring
"""
from prometheus_client import Counter, Histogram, Gauge
import logging

logger = logging.getLogger(__name__)

# Metrics
rate_limit_checks = Counter(
    'rate_limit_checks_total',
    'Total number of rate limit checks',
    ['service', 'result']  # result: allowed, denied, error
)

rate_limit_usage = Gauge(
    'rate_limit_usage_ratio',
    'Current usage ratio of rate limits',
    ['service']
)

rate_limit_backoff = Histogram(
    'rate_limit_backoff_seconds',
    'Backoff delays in seconds',
    ['service'],
    buckets=[0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]
)

api_quota_remaining = Gauge(
    'api_quota_remaining',
    'Remaining API quota',
    ['service', 'limit_type']  # limit_type: requests, tokens
)

rate_limit_circuit_breaker = Gauge(
    'rate_limit_circuit_breaker_open',
    'Circuit breaker status (1=open, 0=closed)',
    []
)

redis_operations = Histogram(
    'rate_limit_redis_duration_seconds',
    'Redis operation duration',
    ['operation'],  # operation: check_limit, get_backoff
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
)


class MetricsCollector:
    """Collects and reports rate limiter metrics"""
    
    @staticmethod
    def record_check(service: str, allowed: bool, error: bool = False):
        """Record a rate limit check"""
        if error:
            result = 'error'
        else:
            result = 'allowed' if allowed else 'denied'
        
        rate_limit_checks.labels(service=service, result=result).inc()
        logger.debug(f"Rate limit check for {service}: {result}")
    
    @staticmethod
    def record_usage(service: str, used: int, limit: int):
        """Record current usage ratio"""
        if limit > 0:
            ratio = used / limit
            rate_limit_usage.labels(service=service).set(ratio)
    
    @staticmethod
    def record_backoff(service: str, delay_ms: int):
        """Record backoff delay"""
        delay_seconds = delay_ms / 1000
        rate_limit_backoff.labels(service=service).observe(delay_seconds)
    
    @staticmethod
    def record_quota(service: str, remaining: int, limit_type: str = 'requests'):
        """Record remaining API quota"""
        api_quota_remaining.labels(service=service, limit_type=limit_type).set(remaining)
    
    @staticmethod
    def set_circuit_breaker(is_open: bool):
        """Set circuit breaker status"""
        rate_limit_circuit_breaker.set(1 if is_open else 0)
    
    @staticmethod
    def time_redis_operation(operation: str):
        """Context manager to time Redis operations"""
        return redis_operations.labels(operation=operation).time()