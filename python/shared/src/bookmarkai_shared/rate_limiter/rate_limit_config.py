"""
Rate limit configuration management
"""
import os
import yaml
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class Algorithm(Enum):
    SLIDING_WINDOW = "sliding_window"
    TOKEN_BUCKET = "token_bucket"


class BackoffType(Enum):
    EXPONENTIAL = "exponential"
    LINEAR = "linear"
    ADAPTIVE = "adaptive"


@dataclass
class RateLimitWindow:
    """Configuration for a single rate limit window"""
    requests: Optional[int] = None  # For sliding window
    window: Optional[int] = None    # Window in seconds
    capacity: Optional[int] = None  # For token bucket
    refill_rate: Optional[float] = None  # Tokens per second
    burst: Optional[int] = None     # Optional burst capacity


@dataclass
class BackoffConfig:
    """Backoff configuration"""
    type: BackoffType = BackoffType.EXPONENTIAL
    initial_delay: int = 1000  # milliseconds
    max_delay: int = 60000     # milliseconds
    multiplier: float = 2.0
    jitter: bool = True


@dataclass
class RateLimitConfig:
    """Rate limit configuration for a service"""
    service: str
    algorithm: Algorithm = Algorithm.SLIDING_WINDOW
    limits: List[RateLimitWindow] = None
    backoff: BackoffConfig = None
    cost_mapping: Optional[Dict[str, float]] = None
    ttl: int = 3600  # Redis key TTL in seconds


class RateLimitConfigLoader:
    """Loads rate limit configurations from YAML file"""
    
    def __init__(self, config_path: Optional[str] = None):
        if config_path is None:
            # Try multiple paths in order of preference
            possible_paths = [
                # Docker path
                '/config/rate-limits.yaml',
                # Environment variable path
                os.environ.get('RATE_LIMITS_CONFIG_PATH', ''),
                # Project root (from Python service perspective)
                os.path.join(os.path.dirname(__file__), '..', '..', '..', '..', '..', '..', 'config', 'rate-limits.yaml'),
                # Alternative project root
                os.path.join(os.getcwd(), 'config', 'rate-limits.yaml'),
            ]
            
            # Find first existing path
            for path in possible_paths:
                if path and os.path.exists(path):
                    config_path = os.path.abspath(path)
                    break
            else:
                # No config found, will use defaults
                config_path = '/config/rate-limits.yaml'
        
        self.config_path = config_path
        self.configs: Dict[str, RateLimitConfig] = {}
        self._load_configs()
    
    def _load_configs(self):
        """Load configurations from YAML file"""
        try:
            if not os.path.exists(self.config_path):
                logger.warning(f"Rate limit config file not found at {self.config_path}, using defaults")
                self._load_defaults()
                return
            
            with open(self.config_path, 'r') as f:
                data = yaml.safe_load(f)
            
            if not data or 'services' not in data:
                logger.error("Invalid config file: missing 'services' key")
                self._load_defaults()
                return
            
            for service_name, service_config in data['services'].items():
                config = self._parse_service_config(service_name, service_config)
                self.configs[service_name] = config
            
            logger.info(f"Loaded {len(self.configs)} rate limit configurations from {self.config_path}")
            
        except Exception as e:
            logger.error(f"Failed to load rate limit configurations: {e}")
            self._load_defaults()
    
    def _parse_service_config(self, service_name: str, config: Dict[str, Any]) -> RateLimitConfig:
        """Parse a single service configuration"""
        algorithm = Algorithm(config.get('algorithm', 'sliding_window'))
        
        # Parse limits
        limits = []
        for limit_config in config.get('limits', []):
            if algorithm == Algorithm.SLIDING_WINDOW:
                limit = RateLimitWindow(
                    requests=limit_config.get('requests'),
                    window=limit_config.get('window'),
                    burst=limit_config.get('burst')
                )
            else:  # TOKEN_BUCKET
                limit = RateLimitWindow(
                    capacity=limit_config.get('capacity'),
                    refill_rate=limit_config.get('refillRate'),
                    burst=limit_config.get('burst')
                )
            limits.append(limit)
        
        # Parse backoff
        backoff_config = config.get('backoff', {})
        backoff = BackoffConfig(
            type=BackoffType(backoff_config.get('type', 'exponential')),
            initial_delay=backoff_config.get('initialDelay', 1000),
            max_delay=backoff_config.get('maxDelay', 60000),
            multiplier=backoff_config.get('multiplier', 2.0),
            jitter=backoff_config.get('jitter', True)
        )
        
        return RateLimitConfig(
            service=service_name,
            algorithm=algorithm,
            limits=limits,
            backoff=backoff,
            cost_mapping=config.get('costMapping'),
            ttl=config.get('ttl', 3600)
        )
    
    def _load_defaults(self):
        """Load default configurations"""
        # OpenAI defaults
        self.configs['openai'] = RateLimitConfig(
            service='openai',
            algorithm=Algorithm.TOKEN_BUCKET,
            limits=[RateLimitWindow(capacity=500, refill_rate=8.33)],
            backoff=BackoffConfig(type=BackoffType.ADAPTIVE, initial_delay=2000, max_delay=300000),
            cost_mapping={
                'gpt-4': 10,
                'gpt-3.5-turbo': 1,
                'text-embedding-ada-002': 0.1,
                'whisper-1': 5
            }
        )
        
        # Anthropic defaults
        self.configs['anthropic'] = RateLimitConfig(
            service='anthropic',
            algorithm=Algorithm.TOKEN_BUCKET,
            limits=[RateLimitWindow(capacity=100, refill_rate=1.67)],
            backoff=BackoffConfig(type=BackoffType.EXPONENTIAL, initial_delay=2000, max_delay=120000),
            cost_mapping={
                'claude-3-opus': 15,
                'claude-3-sonnet': 3,
                'claude-3-haiku': 1
            }
        )
        
        # Whisper API defaults
        self.configs['whisper'] = RateLimitConfig(
            service='whisper',
            algorithm=Algorithm.SLIDING_WINDOW,
            limits=[RateLimitWindow(requests=50, window=60)],
            backoff=BackoffConfig(type=BackoffType.EXPONENTIAL, initial_delay=3000, max_delay=60000)
        )
        
        # Embeddings defaults
        self.configs['embeddings'] = RateLimitConfig(
            service='embeddings',
            algorithm=Algorithm.TOKEN_BUCKET,
            limits=[RateLimitWindow(capacity=1000, refill_rate=16.67)],
            backoff=BackoffConfig(type=BackoffType.LINEAR, initial_delay=1000, max_delay=30000),
            cost_mapping={
                'text-embedding-ada-002': 1,
                'text-embedding-3-small': 0.5,
                'text-embedding-3-large': 2
            }
        )
        
        logger.info(f"Loaded {len(self.configs)} default rate limit configurations")
    
    def get_config(self, service: str) -> Optional[RateLimitConfig]:
        """Get configuration for a specific service"""
        return self.configs.get(service)
    
    def get_all_configs(self) -> Dict[str, RateLimitConfig]:
        """Get all configurations"""
        return self.configs.copy()