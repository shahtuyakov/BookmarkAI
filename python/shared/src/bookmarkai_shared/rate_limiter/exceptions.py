"""
Rate limiter exceptions
"""


class RateLimitError(Exception):
    """Raised when rate limit is exceeded"""
    
    def __init__(self, message: str, service: str, retry_after: int = None, reset_at: int = None):
        super().__init__(message)
        self.message = message
        self.service = service
        self.retry_after = retry_after  # seconds
        self.reset_at = reset_at  # timestamp


class RateLimiterUnavailableError(Exception):
    """Raised when the rate limiter service is unavailable (e.g., Redis down)"""
    
    def __init__(self, message: str = "Rate limiter service unavailable"):
        super().__init__(message)
        self.message = message