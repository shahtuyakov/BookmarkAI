"""Vector embedding generation logic."""

import tiktoken
from typing import Dict, Any, List, Tuple
from openai import OpenAI
import numpy as np

from common.config import settings
from common.utils import measure_time


class VectorEmbedder:
    """Handles text embedding generation using OpenAI."""
    
    def __init__(self):
        """Initialize the embedder."""
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.embedding_model
        self.encoding = tiktoken.encoding_for_model("gpt-3.5-turbo")  # Close enough for token counting
        self.max_tokens_per_chunk = 8191  # Max for text-embedding-3-small
        
    @measure_time
    def generate_embeddings(
        self,
        text: str,
        chunk_size: int = 512,
    ) -> Dict[str, Any]:
        """Generate embeddings for text.
        
        Args:
            text: Text to embed
            chunk_size: Target size for text chunks (in tokens)
            
        Returns:
            Embedding result with vectors and metadata
        """
        # Split text into chunks
        chunks = self._chunk_text(text, chunk_size)
        
        # Generate embeddings for each chunk
        embeddings = []
        total_tokens = 0
        
        for chunk_text, token_count in chunks:
            try:
                response = self.client.embeddings.create(
                    model=self.model,
                    input=chunk_text,
                )
                
                embedding_data = response.data[0]
                embeddings.append({
                    "text": chunk_text,
                    "vector": embedding_data.embedding,
                    "token_count": token_count,
                    "index": len(embeddings),
                })
                
                total_tokens += response.usage.total_tokens
                
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to generate embedding for chunk: {e}")
                raise
        
        # Calculate average embedding for the entire text
        if embeddings:
            all_vectors = np.array([e["vector"] for e in embeddings])
            average_vector = np.mean(all_vectors, axis=0).tolist()
        else:
            average_vector = []
        
        return {
            "embeddings": embeddings,
            "average_vector": average_vector,
            "chunk_count": len(embeddings),
            "total_tokens": total_tokens,
            "model": self.model,
            "dimensions": len(average_vector) if average_vector else 0,
        }
    
    def _chunk_text(self, text: str, chunk_size: int) -> List[Tuple[str, int]]:
        """Split text into chunks of approximately chunk_size tokens.
        
        Returns:
            List of (chunk_text, token_count) tuples
        """
        # Tokenize the entire text
        tokens = self.encoding.encode(text)
        
        if len(tokens) <= chunk_size:
            # Text fits in a single chunk
            return [(text, len(tokens))]
        
        # Split into chunks
        chunks = []
        
        for i in range(0, len(tokens), chunk_size):
            chunk_tokens = tokens[i:i + chunk_size]
            
            # Ensure chunk doesn't exceed model limits
            if len(chunk_tokens) > self.max_tokens_per_chunk:
                chunk_tokens = chunk_tokens[:self.max_tokens_per_chunk]
            
            chunk_text = self.encoding.decode(chunk_tokens)
            chunks.append((chunk_text, len(chunk_tokens)))
        
        return chunks
    
    def calculate_similarity(self, vector1: List[float], vector2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        # Convert to numpy arrays
        v1 = np.array(vector1)
        v2 = np.array(vector2)
        
        # Calculate cosine similarity
        dot_product = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))