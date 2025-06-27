# Vector Embedding Service

A high-performance vector embedding service for BookmarkAI that generates semantic embeddings for content using OpenAI's text-embedding models.

## Features

- 🚀 **Dynamic Model Selection**: Automatically chooses between `text-embedding-3-small` and `text-embedding-3-large` based on content
- 📝 **Intelligent Chunking**: Content-aware chunking strategies for different content types
- 💰 **Cost Optimization**: Budget management with hourly/daily limits
- 📊 **Comprehensive Metrics**: Prometheus metrics and cost tracking
- 🔄 **Batch Processing**: Efficient batch API for bulk operations
- 🛡️ **Production Ready**: Singleton pattern, error handling, and retries

## Architecture

### Model Selection Strategy

- **Short content** (< 1000 tokens): `text-embedding-3-small` ($0.00002/1K tokens)
- **Long content** (> 5000 tokens): `text-embedding-3-large` ($0.00013/1K tokens)
- **Default**: `text-embedding-3-small` for cost efficiency

### Chunking Strategies

1. **Short Content** (tweets, captions): No chunking, direct embedding
2. **Transcript Chunking**: Uses Whisper segments as natural boundaries
   - 30-60 second chunks
   - 10-15% overlap
   - Preserves timestamps
3. **Long-Form Content**: Paragraph-based chunking
   - 400-600 tokens per chunk
   - Respects markdown headers
   - Max 20-30 chunks per document

### Embedding Types

- **Summary Embeddings**: High-level representation for browsing
- **Content Embeddings**: Detailed chunks for deep search
- **Composite Embeddings**: Combined metadata + content

## Environment Variables

```bash
# Required
OPENAI_API_KEY=your-api-key
CELERY_BROKER_URL=amqp://ml:ml_password@rabbitmq:5672/

# Database
DATABASE_URL=postgresql://bookmarkai:password@postgres:5432/bookmarkai_dev

# Budget Limits (optional)
VECTOR_HOURLY_COST_LIMIT=1.0    # Default: $1.00/hour
VECTOR_DAILY_COST_LIMIT=10.0    # Default: $10.00/day
VECTOR_BUDGET_STRICT_MODE=false # Default: false (log warnings but continue)

# Model Selection (optional)
VECTOR_DEFAULT_MODEL=text-embedding-3-small
VECTOR_LARGE_MODEL_THRESHOLD=5000  # Tokens
VECTOR_SMALL_MODEL_THRESHOLD=1000  # Tokens

# Chunking Configuration (optional)
VECTOR_MAX_CHUNK_SIZE=600          # Tokens
VECTOR_CHUNK_OVERLAP=0.15          # 15% overlap
VECTOR_MAX_CHUNKS_PER_DOC=30       # Maximum chunks

# Performance (optional)
VECTOR_BATCH_SIZE=100              # Embeddings per API call
VECTOR_BATCH_TIMEOUT=300           # Seconds to wait for batch

# Monitoring (optional)
PROMETHEUS_METRICS_PORT=9093       # Metrics endpoint
PROMETHEUS_MULTIPROC_DIR=/tmp/prometheus_multiproc_vector
```

## API Integration

### Task Format

```python
# Single embedding task
{
    "share_id": "uuid",
    "content": {
        "text": "Content to embed",
        "type": "caption|transcript|article|tweet",
        "metadata": {
            "title": "Optional title",
            "segments": [...]  # For transcripts
        }
    },
    "options": {
        "embedding_type": "summary|content|composite",
        "force_model": "text-embedding-3-small|text-embedding-3-large",
        "chunk_strategy": "none|transcript|paragraph"
    }
}
```

## Running Locally

```bash
# Install dependencies
cd python/vector-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../shared
pip install -e .

# Run worker
celery -A vector_service.celery_app worker \
    --loglevel=info \
    --queues=ml.embed \
    --concurrency=4 \
    --max-tasks-per-child=50
```

## Docker

The service runs as part of the ML docker-compose stack:

```bash
# Start all ML services
./scripts/start-ml-services.sh

# View logs
docker logs -f bookmarkai-vector-worker

# Stop services
./scripts/stop-ml-services.sh
```

## Testing

```bash
# Unit tests
python -m pytest tests/

# Integration test
cd packages/api-gateway
node test-vector-embedding.js
```

## Monitoring

Access metrics at `http://localhost:9093/metrics`

Key metrics:
- `ml_embeddings_generated_total`: Total embeddings created
- `ml_embedding_chunks_total`: Total chunks processed
- `ml_embedding_model_usage`: Model selection distribution
- `ml_cost_dollars_total{service="vector"}`: Total costs
- `ml_embedding_latency_seconds`: API call latency

## Cost Analysis

### Pricing
- `text-embedding-3-small`: $0.00002/1K tokens
- `text-embedding-3-large`: $0.00013/1K tokens

### Example Costs
- Tweet (50 tokens): $0.000001
- TikTok transcript (500 tokens): $0.00001
- Long article (10K tokens): $0.0013 (large model)

### Optimization Tips
1. Use batch processing during off-peak hours
2. Cache embeddings to avoid reprocessing
3. Use small model for most content
4. Implement content deduplication

## Database Schema

### Tables Created

```sql
-- Vector costs tracking
CREATE TABLE vector_costs (
    id UUID PRIMARY KEY,
    share_id UUID REFERENCES shares(id),
    model VARCHAR(50),
    input_tokens INTEGER,
    chunks_generated INTEGER,
    total_cost DECIMAL(10,6),
    cost_per_token DECIMAL(12,10),
    created_at TIMESTAMP
);

-- Views for monitoring
CREATE VIEW vector_budget_status;
CREATE VIEW hourly_vector_costs;
CREATE MATERIALIZED VIEW daily_vector_costs;
```

### pgvector Integration

The service integrates with PostgreSQL's pgvector extension for similarity search:

```sql
-- Find similar content
SELECT share_id, 1 - (embedding <=> query_vector) AS similarity
FROM embeddings
WHERE 1 - (embedding <=> query_vector) > 0.8
ORDER BY embedding <=> query_vector
LIMIT 10;
```

## Troubleshooting

### Common Issues

1. **Budget Exceeded Error**
   - Check current usage: `SELECT * FROM vector_budget_status;`
   - Adjust limits in environment variables
   - Consider batch processing during off-peak

2. **Token Limit Exceeded**
   - Enable chunking for long content
   - Check `VECTOR_MAX_CHUNK_SIZE` setting
   - Review content preprocessing

3. **Slow Processing**
   - Check worker concurrency settings
   - Monitor RabbitMQ queue depth
   - Consider adding more workers

### Debug Commands

```bash
# Check worker health
docker exec bookmarkai-vector-worker celery -A vector_service.celery_app inspect active

# View recent errors
docker logs bookmarkai-vector-worker --since 1h | grep ERROR

# Check queue status
docker exec ml-rabbitmq rabbitmqctl list_queues name messages consumers

# Verify database connection
docker exec bookmarkai-vector-worker python -c "from vector_service.db import get_db_connection; print('DB OK')"
```

## Performance Benchmarks

- **Throughput**: 100-200 embeddings/minute per worker
- **Latency**: 2-5 seconds for single documents
- **Batch efficiency**: 70-80% cost reduction
- **Storage**: 6KB (small) / 12KB (large) per embedding

## Future Enhancements

- [ ] Local GPU model support (Sentence Transformers)
- [ ] Custom fine-tuned domain models
- [ ] Dimension reduction techniques
- [ ] Multi-language optimized models
- [ ] Real-time streaming API
- [ ] Hybrid search capabilities

## Contributing

See ADR-025 for Python ML service patterns and guidelines.