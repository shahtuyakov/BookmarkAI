# Vector Embedding Service API Documentation

## Overview

The Vector Embedding Service generates high-quality vector representations of text content using OpenAI's embedding models. It supports intelligent chunking, cost tracking, and batch processing for optimal performance.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│   RabbitMQ   │────▶│ Vector Worker   │
│  (Node.js/TS)   │     │  (ml.embed)  │     │ (Python/Celery) │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   OpenAI API    │
                                              │ (Embeddings)    │
                                              └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   PostgreSQL    │
                                              │  (pgvector)     │
                                              └─────────────────┘
```

## API Methods

### 1. Generate Embeddings (Single)

Generates vector embeddings for a single piece of content.

**Node.js/TypeScript:**
```typescript
await mlProducer.publishEmbeddingTask(
  shareId: string,
  content: {
    text: string;
    type?: 'caption' | 'transcript' | 'article' | 'comment' | 'tweet';
    metadata?: Record<string, any>;
  },
  options?: {
    embeddingType?: 'content' | 'summary' | 'composite';
    forceModel?: 'text-embedding-3-small' | 'text-embedding-3-large';
    chunkStrategy?: 'none' | 'transcript' | 'paragraph' | 'sentence' | 'fixed';
    backend?: 'api' | 'local';
  }
);
```

**Parameters:**
- `shareId`: Unique identifier for the content
- `content.text`: The text to generate embeddings for
- `content.type`: Content type for optimized chunking
- `content.metadata`: Additional context (title, URL, author, etc.)
- `options.embeddingType`: Type of embedding to generate
- `options.forceModel`: Override automatic model selection
- `options.chunkStrategy`: Override automatic chunking strategy
- `options.backend`: Use API or local models (future)

### 2. Generate Embeddings (Batch)

Processes multiple embedding tasks efficiently in a single batch.

**Node.js/TypeScript:**
```typescript
await mlProducer.publishBatchEmbeddingTask(
  tasks: Array<{
    shareId: string;
    content: {
      text: string;
      type?: 'caption' | 'transcript' | 'article' | 'comment' | 'tweet';
      metadata?: Record<string, any>;
    };
    options?: {
      embeddingType?: 'content' | 'summary' | 'composite';
      forceModel?: 'text-embedding-3-small' | 'text-embedding-3-large';
      chunkStrategy?: 'none' | 'transcript' | 'paragraph' | 'sentence' | 'fixed';
    };
  }>
);
```

## Content Types & Chunking Strategies

### Content Type Mapping
- **caption**: TikTok/Instagram captions → No chunking
- **tweet**: Twitter/X posts → No chunking
- **comment**: Reddit comments → Sentence-based chunking
- **article**: Long-form content → Paragraph-based chunking
- **transcript**: Video/audio transcripts → Segment-based chunking

### Chunking Strategies

1. **NoChunkingStrategy**: For short content (<400 tokens)
2. **TranscriptChunkingStrategy**: Uses Whisper segments as boundaries
3. **ParagraphChunkingStrategy**: Splits on paragraph boundaries
4. **SentenceChunkingStrategy**: Splits on sentence boundaries
5. **FixedSizeChunkingStrategy**: Fixed token count chunks

## Model Selection

### Automatic Model Selection
- **text-embedding-3-small**: For content <1000 tokens ($0.00002/1K tokens)
- **text-embedding-3-large**: For content >5000 tokens ($0.00013/1K tokens)
- Dynamic selection based on content length and complexity

### Cost Optimization
- Batch processing for up to 100 texts
- Automatic retry with exponential backoff
- Budget limits: $1/hour, $10/day (configurable)

## Database Schema

### embeddings Table
```sql
CREATE TABLE embeddings (
    id UUID PRIMARY KEY,
    share_id UUID REFERENCES shares(id),
    embedding vector(1536),  -- or vector(3072) for large model
    dimensions INTEGER,
    created_at TIMESTAMP
);
```

### vector_costs Table
```sql
CREATE TABLE vector_costs (
    id UUID PRIMARY KEY,
    share_id UUID,
    model VARCHAR(50),
    input_tokens INTEGER,
    chunks_generated INTEGER,
    total_cost DECIMAL(10,6),
    cost_per_token DECIMAL(12,10),
    created_at TIMESTAMP
);
```

## Monitoring & Metrics

### Prometheus Metrics (Port 9093)
- `ml_embeddings_generated_total`: Total embeddings by type/model
- `ml_embedding_chunks_total`: Chunks processed
- `ml_embedding_latency_seconds`: Processing time
- `ml_vector_budget_usage_percentage`: Budget usage

### Budget Monitoring Views
```sql
-- Real-time budget status
SELECT * FROM vector_budget_status;

-- Hourly usage
SELECT * FROM hourly_vector_costs;

-- Daily analytics (materialized)
SELECT * FROM daily_vector_costs;
```

## Error Handling

### Retry Policy
- Max retries: 3
- Exponential backoff: 60s, 120s, 180s
- Soft timeout: 5 minutes
- Hard timeout: 10 minutes

### Budget Exceeded
- Returns `BudgetExceededError`
- No automatic retry
- Logs to `vector_budget_status`

## Usage Examples

### Example 1: Simple Caption Embedding
```typescript
// TikTok caption
await mlProducer.publishEmbeddingTask(
  'share-123',
  {
    text: 'Check out this AI tutorial! #machinelearning #ai',
    type: 'caption',
    metadata: {
      platform: 'tiktok',
      author: '@aiexpert'
    }
  }
);
```

### Example 2: Long Article with Chunking
```typescript
// Long article
await mlProducer.publishEmbeddingTask(
  'share-456',
  {
    text: longArticleText,
    type: 'article',
    metadata: {
      title: 'Understanding Vector Embeddings',
      url: 'https://example.com/article'
    }
  },
  {
    embeddingType: 'content',
    chunkStrategy: 'paragraph'
  }
);
```

### Example 3: Batch Processing
```typescript
// Process multiple items
const tasks = tweets.map(tweet => ({
  shareId: tweet.id,
  content: {
    text: tweet.text,
    type: 'tweet' as const,
    metadata: { author: tweet.author }
  }
}));

await mlProducer.publishBatchEmbeddingTask(tasks);
```

## Performance Considerations

### Throughput
- Single task: ~2-5 seconds
- Batch (100 items): ~10-30 seconds
- Concurrent workers: 4 (configurable)

### Storage
- Small embedding: 1536 dimensions × 4 bytes = 6KB
- Large embedding: 3072 dimensions × 4 bytes = 12KB
- With metadata: +1-2KB per embedding

## Security

- API keys stored in environment variables
- No PII in embeddings
- Secure RabbitMQ authentication
- PostgreSQL row-level security ready

## Future Enhancements

1. **Local GPU Models**: Support for on-premise embedding generation
2. **Multi-language Support**: Optimized models for non-English content
3. **Custom Fine-tuning**: Domain-specific embedding models
4. **Streaming API**: Real-time embedding generation
5. **Compression**: Dimension reduction techniques