# BookmarkAI Python ML Services

This directory contains the Python-based ML microservices for BookmarkAI, implementing ADR-025 (Python ML Microservice Framework & Messaging Architecture).

## Services

### 🤖 LLM Service (`llm-service/`)
Handles content summarization using LLMs (OpenAI, Anthropic).

**Features:**
- Celery worker consuming from `ml.summarize` queue
- Support for multiple LLM providers
- Configurable summarization styles
- Result persistence to PostgreSQL
- Duplicate suppression with celery-singleton
- Automatic retry on failures

**Status:** ✅ Implemented and tested

### 🎤 Whisper Service (`whisper-service/`)
*Coming soon* - Audio/video transcription using OpenAI Whisper
- Will consume from `ml.transcribe` queue
- Support for audio/video file processing
- Automatic language detection

**Status:** 🚧 To be migrated to Celery pattern

### 🔢 Vector Service (`vector-service/`)
*Coming soon* - Text embeddings for semantic search
- Will consume from `ml.embed` queue
- Batch processing for efficiency
- Storage in pgvector

**Status:** 📋 Planned

### 📸 Caption Service (`caption-service/`)
*Coming soon* - Image captioning for visual content
- Will consume from `ml.caption` queue
- Support for multiple image formats

**Status:** 📋 Planned

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Node.js   │────▶│   RabbitMQ   │────▶│   Python    │
│   Producer  │     │   (Quorum)   │     │   Workers   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────┐
                    │    Redis     │     │ PostgreSQL  │
                    │  (Singleton) │     │(ml_results) │
                    └──────────────┘     └─────────────┘
```

## Quick Start

### 1. Set up environment variables

```bash
# Set required API keys
export OPENAI_API_KEY="your-openai-api-key"
export ANTHROPIC_API_KEY="your-anthropic-api-key"  # Optional
```

### 2. Start services

```bash
# From project root
./scripts/start-ml-services.sh
```

This will:
- Start PostgreSQL, Redis, and RabbitMQ if not running
- Build ML service Docker images
- Start the LLM worker container
- Set up proper networking between services

### 3. Monitor services

- RabbitMQ Management: http://localhost:15672 (ml/ml_password)
- Flower (optional): `docker-compose -f docker/docker-compose.ml.yml --profile monitoring up flower`
  - Access at: http://localhost:5555 (admin/bookmarkai123)

### 4. Test the pipeline

```bash
# From api-gateway directory
pnpm test:ml-pipeline
```

### 5. Stop services

```bash
./scripts/stop-ml-services.sh
```

## Development

### Running workers locally

```bash
cd python/llm-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../shared
pip install -e .

# Start worker
celery -A llm_service.celery_app worker --loglevel=info --queues=ml.summarize
```

### Testing

```bash
# Test summarization locally
python test_local.py
```

### Adding new ML services

1. Create new service directory: `python/new-service/`
2. Copy structure from `llm-service/`
3. Update queue name in `tasks.py` (e.g., `ml.new_task`)
4. Add queue configuration to `shared/src/bookmarkai_shared/celery_config.py`
5. Add service to `docker/docker-compose.ml.yml`
6. Update Node.js producer to publish to new queue

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CELERY_BROKER_URL` | RabbitMQ connection URL | `amqp://ml:ml_password@rabbitmq:5672/` |
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://bookmarkai:bookmarkai_password@postgres:5432/bookmarkai_dev` |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379/0` |
| `OPENAI_API_KEY` | OpenAI API key | Required for LLM service |
| `ANTHROPIC_API_KEY` | Anthropic API key | Optional |

### Worker Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKER_CONCURRENCY` | Number of concurrent workers | 4 (CPU), 1 (GPU) |
| `WORKER_PREFETCH_MULTIPLIER` | Tasks to prefetch | 8 (CPU), 1 (GPU) |
| `WORKER_MAX_TASKS_PER_CHILD` | Tasks before worker restart | 50 |

## Monitoring

### Celery Tasks
- Use Flower UI for real-time monitoring
- Check RabbitMQ Management for queue depths
- Monitor `ml_results` table for processing results

### Logs
Workers log to stdout with structured JSON format when `LOG_LEVEL=INFO`.

### Metrics
*Coming soon* - Prometheus metrics via OpenTelemetry

## Troubleshooting

### Common Issues

1. **"No module named 'bookmarkai_shared'"**
   - Install shared module: `pip install -e ../shared`

2. **"Connection refused" to RabbitMQ**
   - Check RabbitMQ is running: `docker ps | grep rabbitmq`
   - Verify connection URL matches docker-compose configuration

3. **Tasks not processing**
   - Check worker logs for errors
   - Verify queue names match between producer and consumer
   - Check RabbitMQ Management UI for messages

4. **Memory issues**
   - Workers auto-restart after 50 tasks
   - Adjust `WORKER_MAX_TASKS_PER_CHILD` if needed

## Implementation Details

### Shared Module (`shared/`)
Contains common configuration and utilities for all Python ML services:
- Celery configuration with queue definitions
- Database connection utilities
- Common task decorators and error handling
- Shared data models

### Message Format
All ML tasks follow a standard message format:
```json
{
  "share_id": "uuid",
  "content": {
    "text": "content to process",
    "url": "optional source URL",
    "metadata": {}
  },
  "options": {
    "style": "concise|detailed",
    "max_length": 500
  }
}
```

### Result Storage
Results are stored in the `ml_results` table:
- `share_id`: Reference to the share
- `task_type`: Type of ML task (summarize, transcribe, embed)
- `result`: JSON result data
- `metadata`: Processing metadata
- Unique constraint on (share_id, task_type)

## Next Steps

- [ ] Migrate Whisper service to Celery worker pattern
- [ ] Implement vector embedding service
- [ ] Add OpenTelemetry instrumentation
- [ ] Create Grafana dashboards for monitoring
- [ ] Set up contract validation between services
- [ ] Configure KEDA autoscaling for Kubernetes deployment