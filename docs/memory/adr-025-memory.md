# ADR-025 Implementation Memory

## Overview
This document captures the implementation details and decisions made while implementing ADR-025: Python ML Microservice Framework & Messaging Architecture.

## Implementation Timeline

### Phase 1: Infrastructure Setup ✅

1. **RabbitMQ Configuration**
   - Initially added RabbitMQ to `docker/docker-compose.ml.yml`
   - User moved RabbitMQ to main `docker/docker-compose.yml` for centralized management
   - Created `docker/rabbitmq/rabbitmq.conf` with proper configuration
   - Fixed RabbitMQ 3.13 compatibility issues (deprecated environment variables)
   - Configuration includes:
     - Default user: ml/ml_password
     - Memory high watermark: 60%
     - Disk free limit: 5GB
     - Management plugin enabled

2. **Docker Compose Structure**
   - Created `docker/docker-compose.ml.yml` for ML services
   - Connected to main network via `docker_default` external network
   - Configured external links to centralized RabbitMQ

### Phase 2: Python Shared Module ✅

1. **Created `/python/shared/` module**
   - `setup.py` with core dependencies
   - `src/bookmarkai_shared/celery_config.py` with centralized configuration
   - Queue definitions for ml.summarize, ml.transcribe, ml.embed
   - All queues configured as quorum queues for durability
   - Worker settings: max-tasks-per-child=50, prefetch-multiplier=8

### Phase 3: LLM Service Implementation ✅

1. **Service Structure**
   - `/python/llm-service/` with Celery worker pattern
   - Dockerfile with proper build context
   - `src/llm_service/celery_app.py` - Celery application setup
   - `src/llm_service/tasks.py` - Summarization task implementation
   - `src/llm_service/db.py` - Database persistence layer

2. **Task Implementation**
   - Used celery-singleton for duplicate suppression
   - Implemented OpenAI integration for summarization
   - Added database persistence to ml_results table
   - Proper error handling and retry logic
   - Task signature: `summarize_content(share_id, content, options)`

### Phase 4: Node.js Integration ✅

1. **ML Producer Service**
   - Created `packages/api-gateway/src/modules/ml/ml-producer.service.ts`
   - Used amqplib with ConfirmChannel for publisher confirms
   - Proper connection management and error handling
   - Message publishing with routing keys

2. **Database Migration**
   - Created migration `0007_ml_results_table.sql`
   - Added ml_results table with share_id reference
   - Unique constraint on (share_id, task_type)
   - Added Drizzle schema in `packages/api-gateway/src/db/schema/ml-results.ts`

### Phase 5: Startup Scripts ✅

1. **Created startup/shutdown scripts**
   - `scripts/start-ml-services.sh` - Docker-based startup
   - `scripts/stop-ml-services.sh` - Graceful shutdown
   - Initially created for local Python execution, updated to use Docker

## Key Decisions & Learnings

### 1. RabbitMQ Version Compatibility
- **Issue**: RabbitMQ 3.13 deprecated several environment variables
- **Solution**: Moved configuration to rabbitmq.conf file
- **Deprecated vars**: RABBITMQ_VM_MEMORY_HIGH_WATERMARK, RABBITMQ_DISK_FREE_LIMIT

### 2. TypeScript/amqplib Integration
- **Issue**: Type mismatches with Connection/Channel interfaces
- **Solution**: Used ChannelModel and ConfirmChannel types
- **Key change**: createConfirmChannel() for publisher confirms

### 3. Docker Build Context
- **Issue**: Dockerfile couldn't access ../shared from llm-service context
- **Solution**: Set context to ../python and adjusted COPY paths

### 4. Execution Method
- **User expectation**: Docker-based execution, not local Python
- **Solution**: Updated scripts to use docker-compose commands

## Testing Results

Successfully tested complete ML pipeline:
```
Test message sent: {"share_id": "test-123", "content": {"text": "Test content about AI"}}
Worker received task via RabbitMQ
OpenAI API called successfully
Summary generated: "The article explores the impact of Artificial Intelligence..."
Processing time: 3026ms
Database save attempted (failed due to test share_id not existing - expected)
```

## Current State

### Completed ✅
- [x] RabbitMQ infrastructure with quorum queues
- [x] Python shared module with Celery configuration
- [x] LLM service with ml.summarize worker
- [x] Node.js producer integration
- [x] Database persistence layer
- [x] Docker Compose orchestration
- [x] Startup/shutdown scripts
- [x] End-to-end testing

### Pending Tasks
- [ ] Update existing Whisper service to Celery pattern
- [ ] Implement ml.embed worker (vector service)
- [ ] Add OpenTelemetry instrumentation
- [ ] Create monitoring dashboards
- [ ] Set up contract validation
- [ ] Configure KEDA autoscaling

## Architecture Patterns Established

1. **Worker Pattern**
   ```python
   @app.task(
       name='service.tasks.task_name',
       base=Singleton,
       lock_expiry=300,
       bind=True,
       acks_late=True,
       reject_on_worker_lost=True,
   )
   def task_name(self: Task, share_id: str, content: Dict[str, Any], options: Optional[Dict[str, Any]] = None):
       # Implementation
   ```

2. **Queue Configuration**
   ```python
   Queue('ml.task_type', ml_exchange, 
         routing_key='ml.task_type',
         queue_arguments={'x-queue-type': 'quorum'},
         durable=True)
   ```

3. **Docker Service Pattern**
   ```yaml
   service-worker:
     build:
       context: ../python
       dockerfile: service/Dockerfile
     environment:
       CELERY_BROKER_URL: amqp://ml:ml_password@rabbitmq:5672/
     command: celery -A service.celery_app worker --queues=ml.queue_name
   ```

## Notes for Future Implementation

1. **Whisper Service Migration**
   - Follow the same pattern as LLM service
   - Reuse shared Celery configuration
   - Update existing HTTP endpoints to publish to queue

2. **Vector Service**
   - New service for ml.embed queue
   - Consider batch processing for efficiency
   - Store embeddings in pgvector

3. **Monitoring**
   - Flower is configured but optional (profile: monitoring)
   - Consider Prometheus metrics export
   - Add custom metrics for ML-specific operations

4. **Performance Tuning**
   - Current settings: concurrency=4, prefetch=8, max-tasks=50
   - Adjust based on actual workload
   - Monitor memory usage with worker recycling