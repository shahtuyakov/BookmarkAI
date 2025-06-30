"""Content pre-flight validation for LLM service."""

import os
import re
import logging
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)


class ContentValidationError(Exception):
    """Exception raised when content fails validation."""
    pass


@dataclass
class ContentInfo:
    """Content metadata and validation results."""
    text: str
    word_count: int
    char_count: int
    estimated_tokens: int
    is_valid: bool
    validation_errors: list
    content_type: str
    language: Optional[str] = None
    

class ContentPreflightService:
    """
    Pre-flight validation service for content before LLM processing.
    
    Validates:
    - Content length (min/max)
    - Content type and format
    - Language detection (optional)
    - Token estimation
    """
    
    # Default limits (can be overridden by environment)
    MIN_WORDS = int(os.getenv('LLM_MIN_WORDS', '10'))
    MAX_WORDS = int(os.getenv('LLM_MAX_WORDS', '50000'))
    MIN_CHARS = int(os.getenv('LLM_MIN_CHARS', '50'))
    MAX_CHARS = int(os.getenv('LLM_MAX_CHARS', '200000'))
    
    # Token estimation ratio (rough approximation)
    # GPT models: ~1 token per 4 chars or ~0.75 tokens per word
    CHARS_PER_TOKEN = 4
    TOKENS_PER_WORD = 0.75
    
    # Content patterns
    BINARY_PATTERN = re.compile(r'[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f-\xff]')
    URL_PATTERN = re.compile(r'https?://\S+')
    EMAIL_PATTERN = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    
    def __init__(self):
        """Initialize the preflight service."""
        self.min_words = self.MIN_WORDS
        self.max_words = self.MAX_WORDS
        self.min_chars = self.MIN_CHARS
        self.max_chars = self.MAX_CHARS
        
    def validate_content(
        self,
        text: str,
        content_type: str = 'article',
        check_language: bool = False
    ) -> ContentInfo:
        """
        Validate content before processing.
        
        Args:
            text: The text content to validate
            content_type: Type of content (article, tweet, reddit, etc.)
            check_language: Whether to detect language
            
        Returns:
            ContentInfo object with validation results
            
        Raises:
            ContentValidationError: If content fails critical validation
        """
        errors = []
        
        # Basic checks
        if not text:
            raise ContentValidationError("No content provided")
            
        if not isinstance(text, str):
            raise ContentValidationError("Content must be a string")
        
        # Clean and normalize text
        text = text.strip()
        
        # Check for binary content
        if self.BINARY_PATTERN.search(text):
            errors.append("Content appears to contain binary data")
        
        # Calculate metrics
        word_count = len(text.split())
        char_count = len(text)
        estimated_tokens = self._estimate_tokens(text)
        
        # Length validation
        if word_count < self.min_words:
            errors.append(f"Content too short: {word_count} words (minimum: {self.min_words})")
        elif word_count > self.max_words:
            errors.append(f"Content too long: {word_count} words (maximum: {self.max_words})")
            
        if char_count < self.min_chars:
            errors.append(f"Content too short: {char_count} chars (minimum: {self.min_chars})")
        elif char_count > self.max_chars:
            errors.append(f"Content too long: {char_count} chars (maximum: {self.max_chars})")
        
        # Content type specific validation
        if content_type == 'tweet' and word_count > 280:
            errors.append("Tweet content exceeds typical length")
        elif content_type == 'article' and word_count < 100:
            errors.append("Article content seems too short")
        elif content_type in ['video_combined', 'video', 'transcript'] and word_count < 5:
            errors.append("Video content seems too short")
        elif content_type in ['caption', 'tiktok'] and word_count < 3:
            errors.append("Caption content seems too short")
            
        # Check for empty or repetitive content
        unique_words = set(text.lower().split())
        if len(unique_words) < 5:
            errors.append("Content has very few unique words")
            
        # Language detection (optional)
        language = None
        if check_language:
            language = self._detect_language(text)
            if language == 'unknown':
                errors.append("Unable to detect content language")
        
        # Determine if content is valid
        is_valid = len(errors) == 0
        
        # Log validation results
        if errors:
            logger.warning(f"Content validation issues: {errors}")
        else:
            logger.info(
                f"Content validated: {word_count} words, {char_count} chars, "
                f"~{estimated_tokens} tokens"
            )
        
        return ContentInfo(
            text=text,
            word_count=word_count,
            char_count=char_count,
            estimated_tokens=estimated_tokens,
            is_valid=is_valid,
            validation_errors=errors,
            content_type=content_type,
            language=language
        )
    
    def _estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for the text.
        
        This is a rough approximation. For exact counts, use tiktoken.
        
        Args:
            text: The text to estimate tokens for
            
        Returns:
            Estimated token count
        """
        # Use both character and word-based estimates and take the average
        char_estimate = len(text) / self.CHARS_PER_TOKEN
        word_estimate = len(text.split()) * self.TOKENS_PER_WORD
        
        # Return the average, rounded up
        return int((char_estimate + word_estimate) / 2) + 1
    
    def _detect_language(self, text: str) -> str:
        """
        Simple language detection based on common patterns.
        
        In production, use a proper library like langdetect.
        
        Args:
            text: The text to detect language for
            
        Returns:
            Language code or 'unknown'
        """
        # Very basic heuristic - in production use langdetect
        text_lower = text.lower()
        
        # Common English words
        english_words = {'the', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'}
        english_count = sum(1 for word in english_words if f' {word} ' in f' {text_lower} ')
        
        if english_count >= 3:
            return 'en'
            
        # Add more language detection as needed
        return 'unknown'
    
    def extract_metadata(self, text: str) -> Dict[str, Any]:
        """
        Extract useful metadata from the content.
        
        Args:
            text: The text to extract metadata from
            
        Returns:
            Dictionary with extracted metadata
        """
        metadata = {
            'urls': self.URL_PATTERN.findall(text),
            'emails': self.EMAIL_PATTERN.findall(text),
            'has_code': '```' in text or '<code>' in text,
            'has_lists': any(marker in text for marker in ['1.', '•', '-', '*']),
            'paragraph_count': len([p for p in text.split('\n\n') if p.strip()]),
            'sentence_count': text.count('.') + text.count('!') + text.count('?'),
        }
        
        return metadata
    
    def truncate_to_limit(self, text: str, max_tokens: int = 4000) -> Tuple[str, bool]:
        """
        Truncate text to stay within token limits.
        
        Args:
            text: The text to potentially truncate
            max_tokens: Maximum token limit
            
        Returns:
            Tuple of (truncated_text, was_truncated)
        """
        estimated_tokens = self._estimate_tokens(text)
        
        if estimated_tokens <= max_tokens:
            return text, False
            
        # Estimate how much text we can keep
        ratio = max_tokens / estimated_tokens
        target_chars = int(len(text) * ratio * 0.95)  # 95% to be safe
        
        # Try to truncate at a sentence boundary
        truncated = text[:target_chars]
        last_period = truncated.rfind('.')
        last_newline = truncated.rfind('\n')
        
        # Truncate at the last complete sentence or paragraph
        if last_period > target_chars * 0.8:
            truncated = truncated[:last_period + 1]
        elif last_newline > target_chars * 0.8:
            truncated = truncated[:last_newline]
            
        return truncated, True