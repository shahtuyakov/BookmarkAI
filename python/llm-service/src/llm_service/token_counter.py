"""
Token counting utilities for OpenAI models.
Uses tiktoken for accurate token counting before API calls.
"""
import logging
from typing import Dict, Optional, Union
from functools import lru_cache

logger = logging.getLogger(__name__)

# Model to encoding mapping
MODEL_ENCODING_MAP = {
    # GPT-4 models
    'gpt-4': 'cl100k_base',
    'gpt-4-0314': 'cl100k_base',
    'gpt-4-0613': 'cl100k_base',
    'gpt-4-32k': 'cl100k_base',
    'gpt-4-32k-0314': 'cl100k_base',
    'gpt-4-32k-0613': 'cl100k_base',
    'gpt-4-turbo': 'cl100k_base',
    'gpt-4-turbo-preview': 'cl100k_base',
    'gpt-4-1106-preview': 'cl100k_base',
    'gpt-4-0125-preview': 'cl100k_base',
    'gpt-4o': 'cl100k_base',
    'gpt-4o-mini': 'cl100k_base', 
    'gpt-4o-2024-05-13': 'cl100k_base',
    
    # GPT-3.5 models
    'gpt-3.5-turbo': 'cl100k_base',
    'gpt-3.5-turbo-0301': 'cl100k_base',
    'gpt-3.5-turbo-0613': 'cl100k_base',
    'gpt-3.5-turbo-16k': 'cl100k_base',
    'gpt-3.5-turbo-16k-0613': 'cl100k_base',
    'gpt-3.5-turbo-1106': 'cl100k_base',
    'gpt-3.5-turbo-0125': 'cl100k_base',
}

# Token limits per model
MODEL_TOKEN_LIMITS = {
    'gpt-4': 8192,
    'gpt-4-32k': 32768,
    'gpt-4-turbo': 128000,
    'gpt-4-turbo-preview': 128000,
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-3.5-turbo': 4096,
    'gpt-3.5-turbo-16k': 16384,
    'gpt-3.5-turbo-1106': 16384,
    'gpt-3.5-turbo-0125': 16384,
}


class TokenCounter:
    """
    Token counter for OpenAI models using tiktoken.
    Provides accurate token counting for rate limiting.
    """
    
    def __init__(self, default_encoding: str = 'cl100k_base'):
        """
        Initialize token counter.
        
        Args:
            default_encoding: Default encoding to use for unknown models
        """
        self.default_encoding = default_encoding
        self._encodings = {}
        self._tiktoken_available = self._check_tiktoken()
        
        if self._tiktoken_available:
            # Preload common encodings
            self._preload_encodings(['cl100k_base'])
    
    def _check_tiktoken(self) -> bool:
        """Check if tiktoken is available."""
        try:
            import tiktoken
            return True
        except ImportError:
            logger.warning(
                "tiktoken not installed. Token counting will use estimates. "
                "Install with: pip install tiktoken"
            )
            return False
    
    def _preload_encodings(self, encoding_names: list):
        """Preload encodings for better performance."""
        if not self._tiktoken_available:
            return
            
        import tiktoken
        for encoding_name in encoding_names:
            try:
                self._encodings[encoding_name] = tiktoken.get_encoding(encoding_name)
                logger.info(f"Preloaded encoding: {encoding_name}")
            except Exception as e:
                logger.warning(f"Failed to preload encoding {encoding_name}: {e}")
    
    @lru_cache(maxsize=128)
    def _get_encoding(self, model: str):
        """Get encoding for a model with caching."""
        if not self._tiktoken_available:
            return None
            
        import tiktoken
        
        # Check if we have a direct model mapping
        encoding_name = MODEL_ENCODING_MAP.get(model, self.default_encoding)
        
        # Return cached encoding if available
        if encoding_name in self._encodings:
            return self._encodings[encoding_name]
        
        # Try to get encoding for model
        try:
            # First try model-specific encoding
            encoding = tiktoken.encoding_for_model(model)
            self._encodings[model] = encoding
            return encoding
        except KeyError:
            # Fall back to encoding name
            try:
                encoding = tiktoken.get_encoding(encoding_name)
                self._encodings[encoding_name] = encoding
                return encoding
            except Exception as e:
                logger.error(f"Failed to get encoding for model {model}: {e}")
                return None
    
    def count_tokens(self, text: str, model: str = 'gpt-3.5-turbo') -> int:
        """
        Count tokens in text for a specific model.
        
        Args:
            text: Text to count tokens for
            model: OpenAI model name
            
        Returns:
            Number of tokens
        """
        if not text:
            return 0
        
        # Use tiktoken if available
        if self._tiktoken_available:
            encoding = self._get_encoding(model)
            if encoding:
                try:
                    return len(encoding.encode(text))
                except Exception as e:
                    logger.warning(f"Token counting failed, using estimate: {e}")
        
        # Fallback to estimation
        return self._estimate_tokens(text)
    
    def count_messages_tokens(
        self, 
        messages: list, 
        model: str = 'gpt-3.5-turbo'
    ) -> Dict[str, int]:
        """
        Count tokens for a list of messages (chat format).
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: OpenAI model name
            
        Returns:
            Dict with 'messages', 'total', and per-message token counts
        """
        if not self._tiktoken_available:
            # Estimate for chat format
            total = 0
            per_message = []
            for msg in messages:
                tokens = self._estimate_tokens(msg.get('content', ''))
                tokens += 4  # Role and formatting overhead
                per_message.append(tokens)
                total += tokens
            return {
                'total': total,
                'messages': per_message,
                'estimated': True
            }
        
        encoding = self._get_encoding(model)
        if not encoding:
            return self._estimate_messages_tokens(messages)
        
        # Token counting logic based on OpenAI's guidelines
        tokens_per_message = 3  # <|start|>role<|end|>content<|end|>
        tokens_per_name = 1
        
        total_tokens = 0
        per_message_tokens = []
        
        for message in messages:
            message_tokens = tokens_per_message
            
            for key, value in message.items():
                if key == 'content':
                    message_tokens += len(encoding.encode(value))
                elif key == 'role':
                    message_tokens += len(encoding.encode(value))
                elif key == 'name':
                    message_tokens += len(encoding.encode(value))
                    message_tokens += tokens_per_name
            
            per_message_tokens.append(message_tokens)
            total_tokens += message_tokens
        
        total_tokens += 3  # <|start|>assistant<|end|>
        
        return {
            'total': total_tokens,
            'messages': per_message_tokens,
            'estimated': False
        }
    
    def estimate_tokens_with_safety_margin(
        self, 
        text: str, 
        model: str = 'gpt-3.5-turbo',
        safety_factor: float = 1.2
    ) -> int:
        """
        Estimate tokens with a safety margin for rate limiting.
        
        Args:
            text: Text to count tokens for
            model: OpenAI model name
            safety_factor: Multiplier for safety margin (default 1.2 = 20% extra)
            
        Returns:
            Estimated token count with safety margin
        """
        base_tokens = self.count_tokens(text, model)
        return int(base_tokens * safety_factor)
    
    def _estimate_tokens(self, text: str) -> int:
        """
        Fallback token estimation when tiktoken is not available.
        Based on OpenAI's rough estimates.
        """
        # Rough estimation: ~4 characters per token for English
        # Adjust for whitespace and punctuation
        words = text.split()
        word_count = len(words)
        char_count = len(text)
        
        # More sophisticated estimation
        if word_count > 0:
            avg_word_length = char_count / word_count
            if avg_word_length < 5:
                # Short words, closer to 1 token per word
                return int(word_count * 1.3)
            else:
                # Longer words, use character-based estimate
                return int(char_count / 4)
        else:
            return int(char_count / 4)
    
    def _estimate_messages_tokens(self, messages: list) -> Dict[str, int]:
        """Estimate tokens for messages when tiktoken is not available."""
        total = 0
        per_message = []
        
        for msg in messages:
            content_tokens = self._estimate_tokens(msg.get('content', ''))
            # Add overhead for role and formatting
            message_tokens = content_tokens + 4
            per_message.append(message_tokens)
            total += message_tokens
        
        total += 3  # Assistant response prefix
        
        return {
            'total': total,
            'messages': per_message,
            'estimated': True
        }
    
    def get_model_context_limit(self, model: str) -> int:
        """Get the context window limit for a model."""
        return MODEL_TOKEN_LIMITS.get(model, 4096)
    
    def fits_in_context(
        self, 
        text: str, 
        model: str, 
        max_response_tokens: int = 500
    ) -> bool:
        """
        Check if text fits in model's context window with room for response.
        
        Args:
            text: Input text
            model: OpenAI model name
            max_response_tokens: Reserved space for response
            
        Returns:
            True if text fits, False otherwise
        """
        tokens = self.count_tokens(text, model)
        limit = self.get_model_context_limit(model)
        return tokens + max_response_tokens <= limit