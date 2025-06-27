"""
Content preprocessing for vector embeddings.
Handles content cleaning, normalization, and enrichment.
"""

import re
import logging
from typing import Dict, Any, Optional, Tuple, List
from urllib.parse import urlparse

from .models import ContentType

logger = logging.getLogger(__name__)


class ContentPreprocessor:
    """Preprocessor for cleaning and enriching content before embedding."""
    
    def __init__(self):
        """Initialize the content preprocessor."""
        # Compile regex patterns for efficiency
        self.url_pattern = re.compile(
            r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+'
        )
        self.email_pattern = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
        self.mention_pattern = re.compile(r'@[a-zA-Z0-9_]+')
        self.hashtag_pattern = re.compile(r'#[a-zA-Z0-9_]+')
        self.emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map symbols
            "\U0001F1E0-\U0001F1FF"  # flags (iOS)
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+",
            flags=re.UNICODE
        )
        
        logger.info("Initialized ContentPreprocessor")
    
    def preprocess(
        self,
        content: str,
        content_type: ContentType,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Preprocess content based on its type.
        
        Args:
            content: Raw content text
            content_type: Type of content
            metadata: Optional metadata
            
        Returns:
            Tuple of (processed_content, extracted_metadata)
        """
        if not content:
            return "", {}
        
        # Extract metadata
        extracted_metadata = self._extract_metadata(content)
        
        # Clean content based on type
        if content_type == ContentType.TWEET:
            processed = self._preprocess_tweet(content)
        elif content_type == ContentType.CAPTION:
            processed = self._preprocess_caption(content)
        elif content_type == ContentType.TRANSCRIPT:
            processed = self._preprocess_transcript(content, metadata)
        elif content_type == ContentType.ARTICLE:
            processed = self._preprocess_article(content)
        else:
            processed = self._preprocess_generic(content)
        
        return processed, extracted_metadata
    
    def _extract_metadata(self, content: str) -> Dict[str, Any]:
        """Extract metadata from content."""
        metadata = {
            "urls": self.url_pattern.findall(content),
            "emails": self.email_pattern.findall(content),
            "mentions": self.mention_pattern.findall(content),
            "hashtags": self.hashtag_pattern.findall(content),
            "has_emojis": bool(self.emoji_pattern.search(content)),
            "char_count": len(content),
            "word_count": len(content.split()),
            "line_count": len(content.splitlines())
        }
        
        # Extract domains from URLs
        if metadata["urls"]:
            metadata["domains"] = list(set(
                urlparse(url).netloc for url in metadata["urls"]
            ))
        
        return metadata
    
    def _preprocess_tweet(self, content: str) -> str:
        """Preprocess tweet content."""
        # Keep mentions and hashtags as they're important for context
        processed = content
        
        # Normalize whitespace
        processed = re.sub(r'\s+', ' ', processed)
        
        # Remove excessive newlines
        processed = re.sub(r'\n{3,}', '\n\n', processed)
        
        return processed.strip()
    
    def _preprocess_caption(self, content: str) -> str:
        """Preprocess social media caption."""
        processed = content
        
        # Normalize whitespace
        processed = re.sub(r'\s+', ' ', processed)
        
        # Keep hashtags but normalize spacing
        processed = re.sub(r'#(\w+)', r' #\1 ', processed)
        processed = re.sub(r'\s+', ' ', processed)
        
        return processed.strip()
    
    def _preprocess_transcript(
        self,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Preprocess transcript content."""
        processed = content
        
        # Remove timestamp markers if present
        processed = re.sub(r'\[\d+:\d+\]', '', processed)
        processed = re.sub(r'\(\d+:\d+\)', '', processed)
        
        # Remove speaker labels if present
        processed = re.sub(r'^[A-Z][A-Za-z\s]+:', '', processed, flags=re.MULTILINE)
        
        # Normalize whitespace
        processed = re.sub(r'\s+', ' ', processed)
        
        # Remove filler words (optional, based on config)
        filler_words = ['um', 'uh', 'like', 'you know']
        for filler in filler_words:
            processed = re.sub(rf'\b{filler}\b', '', processed, flags=re.IGNORECASE)
        
        # Clean up extra spaces from removal
        processed = re.sub(r'\s+', ' ', processed)
        
        return processed.strip()
    
    def _preprocess_article(self, content: str) -> str:
        """Preprocess long-form article content."""
        processed = content
        
        # Remove markdown image syntax but keep alt text
        processed = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', processed)
        
        # Convert markdown links to plain text
        processed = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', processed)
        
        # Remove HTML tags if present
        processed = re.sub(r'<[^>]+>', '', processed)
        
        # Normalize whitespace
        processed = re.sub(r'\s+', ' ', processed)
        
        # Preserve paragraph breaks
        processed = re.sub(r'\n\n+', '\n\n', processed)
        
        return processed.strip()
    
    def _preprocess_generic(self, content: str) -> str:
        """Generic preprocessing for unknown content types."""
        processed = content
        
        # Basic normalization
        processed = re.sub(r'\s+', ' ', processed)
        processed = re.sub(r'\n{3,}', '\n\n', processed)
        
        return processed.strip()
    
    def create_enriched_content(
        self,
        content: str,
        metadata: Dict[str, Any],
        content_type: ContentType
    ) -> str:
        """
        Create enriched content by combining text with metadata.
        Used for composite embeddings.
        """
        components = []
        
        # Add main content
        if content:
            components.append(f"Content: {content}")
        
        # Add title if available
        if metadata.get("title"):
            components.append(f"Title: {metadata['title']}")
        
        # Add description if available
        if metadata.get("description"):
            components.append(f"Description: {metadata['description']}")
        
        # Add author if available
        if metadata.get("author"):
            components.append(f"Author: {metadata['author']}")
        
        # Add platform-specific metadata
        if content_type == ContentType.TWEET and metadata.get("mentions"):
            components.append(f"Mentions: {', '.join(metadata['mentions'])}")
        
        if metadata.get("hashtags"):
            components.append(f"Topics: {', '.join(metadata['hashtags'])}")
        
        if metadata.get("tags"):
            tags = metadata['tags']
            if isinstance(tags, list):
                tags = ', '.join(tags)
            components.append(f"Tags: {tags}")
        
        # Add category if available
        if metadata.get("category"):
            components.append(f"Category: {metadata['category']}")
        
        # Add publish date if available
        if metadata.get("published_at"):
            components.append(f"Published: {metadata['published_at']}")
        
        return "\n\n".join(components)
    
    def should_skip_embedding(
        self,
        content: str,
        content_type: ContentType,
        min_length: int = 10
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if content should be skipped for embedding.
        
        Returns:
            Tuple of (should_skip, reason)
        """
        # Check minimum length
        if len(content.strip()) < min_length:
            return True, "Content too short"
        
        # Check if content is just URLs
        content_without_urls = self.url_pattern.sub('', content).strip()
        if not content_without_urls:
            return True, "Content contains only URLs"
        
        # Check if content is just mentions/hashtags (for social media)
        if content_type in [ContentType.TWEET, ContentType.CAPTION]:
            content_without_social = self.mention_pattern.sub('', content)
            content_without_social = self.hashtag_pattern.sub('', content_without_social).strip()
            if not content_without_social:
                return True, "Content contains only mentions/hashtags"
        
        # Check for spam patterns
        if self._is_likely_spam(content):
            return True, "Content appears to be spam"
        
        return False, None
    
    def _is_likely_spam(self, content: str) -> bool:
        """Check if content is likely spam."""
        # Simple spam detection
        spam_patterns = [
            r'(?i)click here',
            r'(?i)buy now',
            r'(?i)limited offer',
            r'(?i)act now',
            r'(?i)congratulations you won',
            r'(?i)claim your prize'
        ]
        
        for pattern in spam_patterns:
            if re.search(pattern, content):
                return True
        
        # Check for excessive caps
        if len(content) > 20:
            caps_ratio = sum(1 for c in content if c.isupper()) / len(content)
            if caps_ratio > 0.7:
                return True
        
        # Check for excessive special characters
        special_chars = sum(1 for c in content if not c.isalnum() and not c.isspace())
        if len(content) > 20 and special_chars / len(content) > 0.5:
            return True
        
        return False