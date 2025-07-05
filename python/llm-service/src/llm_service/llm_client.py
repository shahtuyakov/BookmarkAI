"""
LLM client abstraction for multiple providers.
Supports OpenAI and Anthropic as per BookmarkAI requirements.
"""
import os
import logging
from enum import Enum
from typing import Dict, Any, Optional, List
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class LLMProvider(Enum):
    """Supported LLM providers."""
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


class BaseLLMClient(ABC):
    """Abstract base class for LLM clients."""
    
    @abstractmethod
    def generate_summary(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """Generate a summary from the given prompt."""
        pass


class OpenAIClient(BaseLLMClient):
    """OpenAI API client for summarization."""
    
    def __init__(self):
        # Check both OPENAI_API_KEY and ML_OPENAI_API_KEY
        self.api_key = os.environ.get('OPENAI_API_KEY') or os.environ.get('ML_OPENAI_API_KEY')
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY or ML_OPENAI_API_KEY environment variable not set")
        
        try:
            import openai
            self.client = openai.OpenAI(api_key=self.api_key)
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai")
    
    def generate_summary(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """Generate summary using OpenAI."""
        model = model or "gpt-3.5-turbo"
        
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that creates concise, informative summaries."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=0.7
            )
            
            summary = response.choices[0].message.content
            
            # Extract key points if the summary contains bullet points
            key_points = []
            if '•' in summary or '-' in summary:
                lines = summary.split('\n')
                for line in lines:
                    line = line.strip()
                    if line.startswith(('•', '-', '*')):
                        key_points.append(line.lstrip('•-* '))
            
            # Extract token usage details
            tokens_used = {
                'input': response.usage.prompt_tokens if response.usage else 0,
                'output': response.usage.completion_tokens if response.usage else 0,
                'total': response.usage.total_tokens if response.usage else 0
            }
            
            return {
                'summary': summary,
                'key_points': key_points,
                'model': model,
                'tokens_used': tokens_used
            }
            
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise


class AnthropicClient(BaseLLMClient):
    """Anthropic API client for summarization."""
    
    def __init__(self):
        self.api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")
    
    def generate_summary(
        self,
        prompt: str,
        model: Optional[str] = None,
        max_tokens: int = 500
    ) -> Dict[str, Any]:
        """Generate summary using Anthropic Claude."""
        model = model or "claude-3-sonnet-20240229"
        
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=0.7,
                system="You are a helpful assistant that creates concise, informative summaries.",
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            
            summary = response.content[0].text
            
            # Extract key points
            key_points = []
            if '•' in summary or '-' in summary:
                lines = summary.split('\n')
                for line in lines:
                    line = line.strip()
                    if line.startswith(('•', '-', '*')):
                        key_points.append(line.lstrip('•-* '))
            
            # Extract token usage details
            tokens_used = {
                'input': response.usage.input_tokens if hasattr(response, 'usage') else 0,
                'output': response.usage.output_tokens if hasattr(response, 'usage') else 0,
                'total': (response.usage.input_tokens + response.usage.output_tokens) if hasattr(response, 'usage') else 0
            }
            
            return {
                'summary': summary,
                'key_points': key_points,
                'model': model,
                'tokens_used': tokens_used
            }
            
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise


class LLMClient:
    """Factory class for LLM clients."""
    
    def __init__(self, provider: LLMProvider = LLMProvider.OPENAI):
        self.provider = provider
        self.client = self._create_client()
    
    def _create_client(self) -> BaseLLMClient:
        """Create appropriate client based on provider."""
        if self.provider == LLMProvider.OPENAI:
            return OpenAIClient()
        elif self.provider == LLMProvider.ANTHROPIC:
            return AnthropicClient()
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    def generate_summary(self, **kwargs) -> Dict[str, Any]:
        """Generate summary using configured provider."""
        return self.client.generate_summary(**kwargs)