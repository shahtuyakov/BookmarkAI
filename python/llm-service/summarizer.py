"""LLM-based summarization logic."""

import tiktoken
from typing import Dict, Any, Optional, Literal
from openai import OpenAI

from common.config import settings
from common.utils import measure_time


SummaryStyle = Literal["concise", "detailed", "bullet_points"]


class LLMSummarizer:
    """Handles text summarization using LLMs."""
    
    def __init__(self):
        """Initialize the LLM client."""
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.summary_model
        self.encoding = tiktoken.encoding_for_model(self.model)
        
    @measure_time
    def summarize_text(
        self,
        text: str,
        max_tokens: int = 150,
        style: SummaryStyle = "concise",
    ) -> Dict[str, Any]:
        """Summarize text using LLM.
        
        Args:
            text: Text to summarize
            max_tokens: Maximum tokens for the summary
            style: Summary style (concise, detailed, bullet_points)
            
        Returns:
            Summary result with text and metadata
        """
        # Count input tokens
        input_tokens = len(self.encoding.encode(text))
        
        # Prepare the prompt based on style
        system_prompt = self._get_system_prompt(style)
        
        # Truncate text if too long (leave room for prompt)
        max_input_tokens = 4000  # Conservative limit
        if input_tokens > max_input_tokens:
            text = self._truncate_text(text, max_input_tokens)
            input_tokens = max_input_tokens
        
        try:
            # Call OpenAI API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Please summarize the following content:\n\n{text}"},
                ],
                max_tokens=max_tokens,
                temperature=0.3,  # Lower temperature for more consistent summaries
            )
            
            # Extract summary
            summary = response.choices[0].message.content.strip()
            
            # Calculate usage
            usage = response.usage
            
            return {
                "summary": summary,
                "style": style,
                "input_tokens": input_tokens,
                "output_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens,
                "model": self.model,
                "truncated": input_tokens == max_input_tokens,
            }
            
        except Exception as e:
            # Log error and re-raise
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"LLM summarization failed: {e}")
            raise
    
    def _get_system_prompt(self, style: SummaryStyle) -> str:
        """Get system prompt based on summary style."""
        prompts = {
            "concise": (
                "You are a concise summarizer. Create a brief, clear summary "
                "that captures the key points in 2-3 sentences maximum. "
                "Focus only on the most important information."
            ),
            "detailed": (
                "You are a comprehensive summarizer. Create a detailed summary "
                "that covers all major points while remaining clear and organized. "
                "Include context and important details."
            ),
            "bullet_points": (
                "You are a structured summarizer. Create a summary using bullet points. "
                "Each bullet should be a complete, concise thought. "
                "Use • for main points and - for sub-points if needed. "
                "Limit to 5-7 main points."
            ),
        }
        return prompts.get(style, prompts["concise"])
    
    def _truncate_text(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within token limit."""
        tokens = self.encoding.encode(text)
        if len(tokens) <= max_tokens:
            return text
        
        # Truncate and decode
        truncated_tokens = tokens[:max_tokens]
        truncated_text = self.encoding.decode(truncated_tokens)
        
        # Add ellipsis to indicate truncation
        return truncated_text + "..."