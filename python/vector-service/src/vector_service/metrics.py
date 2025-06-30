"""
Vector-specific Prometheus metrics.

This module extends the shared metrics with vector embedding specific metrics.
"""

import os
from prometheus_client import Counter, Histogram, Gauge
from bookmarkai_shared.metrics import registry

# Embedding generation metrics
embeddings_generated_total = Counter(
    'ml_embeddings_generated_total',
    'Total number of embeddings generated',
    ['content_type', 'embedding_type', 'model'],
    registry=registry
)

embedding_chunks_total = Counter(
    'ml_embedding_chunks_total',
    'Total number of content chunks processed',
    ['content_type', 'chunk_strategy'],
    registry=registry
)

embedding_model_usage = Counter(
    'ml_embedding_model_usage',
    'Count of embeddings by model',
    ['model'],
    registry=registry
)

embedding_latency_seconds = Histogram(
    'ml_embedding_latency_seconds',
    'Time to generate embeddings',
    ['content_type'],
    buckets=(0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60),
    registry=registry
)

# Batch processing metrics
batch_embeddings_total = Counter(
    'ml_batch_embeddings_total',
    'Number of embeddings processed in batch',
    ['status'],
    registry=registry
)

batch_processing_duration = Histogram(
    'ml_batch_processing_duration_seconds',
    'Time to process embedding batches',
    buckets=(1, 5, 10, 30, 60, 300, 600, 1200, 1800),
    registry=registry
)

# Vector-specific cost metrics
vector_cost_by_model = Counter(
    'ml_vector_cost_dollars_by_model',
    'Cost of vector operations by model',
    ['model'],
    registry=registry
)

# Chunking metrics
chunks_per_document = Histogram(
    'ml_chunks_per_document',
    'Number of chunks created per document',
    ['content_type'],
    buckets=(1, 2, 5, 10, 20, 30, 50, 100),
    registry=registry
)

chunk_size_tokens = Histogram(
    'ml_chunk_size_tokens',
    'Size of chunks in tokens',
    ['content_type', 'chunk_strategy'],
    buckets=(50, 100, 200, 400, 600, 800, 1000, 1500, 2000),
    registry=registry
)

# Skip metrics
embeddings_skipped_total = Counter(
    'ml_embeddings_skipped_total',
    'Number of embeddings skipped',
    ['reason', 'content_type'],
    registry=registry
)

# Search metrics (for future use)
similarity_searches_total = Counter(
    'ml_similarity_searches_total',
    'Total number of similarity searches performed',
    ['content_type'],
    registry=registry
)

similarity_search_duration = Histogram(
    'ml_similarity_search_duration_seconds',
    'Time to perform similarity search',
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
    registry=registry
)

# Budget metrics specific to vectors
vector_budget_usage = Gauge(
    'ml_vector_budget_usage_percentage',
    'Current budget usage percentage',
    ['budget_type'],  # hourly, daily
    registry=registry
)


def update_budget_metrics():
    """Update budget usage gauges based on current spending."""
    try:
        from .db import get_budget_status
        status = get_budget_status()
        
        if 'error' not in status:
            vector_budget_usage.labels(budget_type='hourly').set(
                status['hourly']['percentage']
            )
            vector_budget_usage.labels(budget_type='daily').set(
                status['daily']['percentage']
            )
    except Exception as e:
        # Don't fail if metrics update fails
        pass