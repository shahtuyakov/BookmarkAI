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
- [x] Whisper service structure setup (whisper-1)
  - Created directory structure
  - Setup.py with dependencies
  - Dockerfile with ffmpeg
  - Celery app configuration
  - Added ml.transcribe_local queue to shared config
  - Updated task routes for whisper.tasks.transcribe_api/local
  - Created comprehensive README

### Week 1 Completed ✅
- [x] Audio processing implementation (whisper-2)
  - AudioProcessor class with download, extraction, normalization
  - Smart chunking for 10-minute segments
  - Loudness normalization with ffmpeg
  - Comprehensive error handling and cleanup
- [x] Transcription service implementation (whisper-3)
  - TranscriptionService with OpenAI Whisper API
  - Pydantic models for type safety
  - Chunk merging with timestamp adjustment
  - Cost calculation and estimation
  - Placeholder for future GPU implementation
- [x] Celery task implementation (whisper-4)
  - transcribe_api task with singleton pattern
  - Comprehensive error handling and retries
  - Soft timeout handling with partial results
  - Metrics tracking for processing time
  - Fallback implementation for transcribe_local
- [x] Database layer implementation (whisper-5)
  - save_transcription_result with ml_results table
  - track_transcription_cost for analytics (graceful if table missing)
  - get_transcription_result for retrieval
  - get_cost_summary for usage analytics
  - Context manager for connection handling
- [x] Docker integration
  - Added whisper-worker to docker-compose.ml.yml
  - Environment variable configuration
  - Cost limit controls

### Database & Integration Completed ✅
- [x] Database migration (0008_transcription_costs.sql)
  - Created transcription_costs table with proper constraints
  - Added materialized view for daily cost aggregation
  - Included refresh function for analytics
  - Indexes for performance on common queries
- [x] Updated Node.js ML Producer
  - Enhanced publishTranscriptionTask with backend selection
  - Support for api/local routing
  - Correct task name mapping (whisper.tasks.transcribe_api/local)
  - Added ml.transcribe_local queue assertion
- [x] Integration scripts
  - Updated start-ml-services.sh to include whisper-worker
  - Updated stop-ml-services.sh for both workers
  - Added OPENAI_API_KEY validation
  - Removed database migrations from start script (kept separate)
  - Created test-whisper-integration.sh for end-to-end testing

### Next Steps 🚧
- [ ] Week 1.5: Cost Budget Ceiling (whisper-6)
- [ ] Week 1.5: Pre-flight Checks (whisper-7)
- [ ] Week 1.5: Silence Detection (whisper-8)

### Whisper-Worker MVP — Practical Recommendations

| #      | Recommendation                                                                                                                                  | Why it matters for 5-10 min TikTok clips / cost control                                                                                                       |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Start with an *API-only* “transcribe\_api” queue.**  Celery CPU worker streams audio to OpenAI Whisper API.                                   | • Zero GPU infra on day-1.<br>• Costs only \$0.03 per 5 min clip; you stay well below GPU break-even until \~60 audio-hours/day.                              |
| **2**  | **Strip audio with ffmpeg inside the task.**  Store temp file in `/tmp`, down-mix to 16-kHz mono AAC/OPUS.                                      | • Keeps most TikTok audio ≤12 MB so it passes the 25 MB Whisper limit.<br>• Avoids pushing video bytes through Node.                                          |
| **3**  | **Chunk if file > 20 MB or length > 600 s.**  Slice into ≤25 MB WAV segments and call the API sequentially.                                     | • Guarantees the API never rejects oversize requests.<br>• Keeps code path identical when you later swap in local Whisper (which slides 30 s windows anyway). |
| **4**  | **Return rich result JSON:** `{text, segments: [{start,end,text}], billing_usd}`.                                                               | • Lets the DB store exact cost; front-end can highlight words with timestamps.<br>• Segment list is reusable when you move to local Whisper.                  |
| **5**  | **Hard-timeout 15 min (`time_limit=900`).**  On soft timeout retry once to API; on second failure mark task `error`.                            | • Prevents a corrupted media file from choking the queue.<br>• Keeps RabbitMQ backlog predictable.                                                            |
| **6**  | **Wire cost telemetry early.**  `billing_usd = audio_sec / 60 * 0.006`.  Log & store in `ml_results`.                                           | • Makes the “API vs GPU” switch a data-driven conversation later.                                                                                             |
| **7**  | **Plan the *local* path now:**  create **empty** `ml.transcribe_local` queue & Dockerfile with Faster-Whisper GPU runtime, but don’t deploy it. | • Zero code change when demand spikes—just spin GPU pods and adjust Node router rule.                                                                         |
| **8**  | **Node routing flag:** if `process.env.PREFERRED_STT === "local"` route to `transcribe_local`, else default to `transcribe_api`.                | • One env-var flip (or a simple heuristic) migrates load to GPUs when ROI is clear.                                                                           |
| **9**  | **Add VAD pre-filter (optional):** run `webrtcvad` to skip long silences/music beds >300 ms.                                                    | • Cuts Whisper bill 20-40 % on clips with intro/outro music; speeds local inference too.                                                                      |
| **10** | **Write a fallback wrapper:** if local GPU task raises OOM or exceeds 2× realtime, re-enqueue the same payload to `transcribe_api`.             | • Guarantees no user-facing failure if GPU pool is saturated or buggy.                                                                                        |

#### Minimal code skeleton (worker)

```python
@celery.task(name="tasks.transcribe_whisper", base=Singleton, lock_expiry=900)
def transcribe_whisper(job: dict, backend="api"):
    audio = fetch_and_normalise(job["payload"]["mediaUrl"])
    if backend == "local" and os.getenv("PREFER_LOCAL"):
        try:
            return run_local_whisper(audio)
        except Exception:  # GPU fail → fall back
            backend = "api"
    return call_openai_whisper(audio)
```

*`run_local_whisper`* is a no-op in MVP; fill it in when you provision GPUs.

---

**Bottom line:**
Ship the simple CPU/API worker first—it handles 5-10 min TikTok videos with affordable per-minute pricing and zero GPU ops risk. Lay down the extra queue, env-switch, and result schema today so sliding to local Faster-Whisper is a deploy-not-rewrite when volume or privacy concerns justify it.

### Pending Tasks
- [x] ~~Update existing Whisper service to Celery pattern~~ ✅ COMPLETED
- [ ] Implement ml.embed worker (vector service)
- [ ] Add OpenTelemetry instrumentation
- [ ] Create monitoring dashboards
- [ ] Set up contract validation

## Whisper Worker Implementation Summary

### What Was Built
The complete Whisper transcription worker following ADR-025 patterns:

1. **Core Service** (`python/whisper-service/`)
   - Celery worker with singleton pattern
   - OpenAI Whisper API integration
   - Audio processing with ffmpeg (normalization, chunking)
   - Cost tracking from day one
   - Database persistence in ml_results table

2. **Key Features Implemented**
   - **Smart Audio Processing**: Extracts, normalizes to 16kHz mono, chunks for API limits
   - **Cost Awareness**: Tracks every transcription cost, ready for GPU ROI analysis
   - **Robust Error Handling**: Retries, soft timeouts, partial result saving
   - **Type Safety**: Pydantic models throughout
   - **Future Ready**: ml.transcribe_local queue ready for GPU deployment

3. **Integration Complete**
   - Database migration for transcription_costs table
   - Node.js ML producer updated with proper routing
   - Docker Compose configuration
   - Start/stop scripts updated
   - Test infrastructure in place

### Quick Start
```bash
# Set API key
export OPENAI_API_KEY="your-key"

# Start all ML services
./scripts/start-ml-services.sh

# Run database migration (if needed)
cd packages/api-gateway && pnpm run db:migrate

# Test transcription
./scripts/test-whisper-integration.sh

# Monitor logs
docker logs -f bookmarkai-whisper-worker
```

### Cost Analysis
- API Cost: $0.006/minute ($0.36/hour)
- Break-even: ~60 audio-hours/day for GPU investment
- Current implementation tracks all costs for data-driven decisions
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

## Whisper Service Implementation (Completed) ✓

### Week 1 Tasks Completed ✓

1. **Core Service Setup (whisper-1)** ✓
   - Created `/python/whisper-service/` directory structure
   - Implemented Dockerfile with ffmpeg and OpenAI dependencies
   - Created setup.py with all required packages
   - Implemented celery_app.py with singleton configuration

2. **Audio Processing (whisper-2)** ✓
   - Implemented `AudioProcessor` class with:
     - Media download (HTTP/HTTPS support)
     - Audio extraction using ffmpeg
     - Loudness normalization (EBU R128 standard: -16 LUFS)
     - Smart chunking for 10-minute segments
     - Automatic format conversion to AAC mono 16kHz

3. **Transcription Service (whisper-3)** ✓
   - Implemented `TranscriptionService` with OpenAI Whisper API
   - Cost tracking: $0.006/minute
   - Segment parsing with timestamps
   - Chunk merging for long videos
   - Proper error handling for API failures

4. **Celery Tasks (whisper-4)** ✓
   - Implemented `transcribe_api` task with singleton pattern
   - Proper task routing to `ml.transcribe` queue
   - Error handling and retry logic
   - Temporary file cleanup

5. **Database Integration (whisper-5)** ✓
   - Stores results in `ml_results` table
   - Created migration `0008_transcription_costs.sql`
   - Cost tracking table with materialized view
   - Integration with Node.js ML producer

6. **TikTok Integration (bonus)** ✓
   - Implemented yt-dlp service for video URL extraction
   - Updated TikTok fetcher to extract actual video URLs
   - Full end-to-end pipeline tested and working
   - Automatic transcription for all TikTok videos

### Testing Results

1. **Direct Test Success**
   - Successfully transcribed test video (Big Buck Bunny)
   - Audio extraction and normalization working
   - OpenAI API integration functional
   - Cost calculation correct ($0.0005 for 5.3s)

2. **Bug Fixes Applied**
   - Fixed segment parsing to handle both dict and object responses
   - Fixed module resolution for test scripts

3. **TikTok Integration Issue**
   - TikTok fetcher only provides oEmbed data (no video URLs)
   - Whisper worker correctly rejects non-video URLs
   - Need to extract actual video URLs at fetcher level

### Infrastructure Updates

1. **Start/Stop Scripts**
   - Added whisper-worker to `scripts/start-ml-services.sh`
   - Added whisper-worker to `scripts/stop-ml-services.sh`
   - Added OPENAI_API_KEY validation

2. **Docker Compose**
   - Whisper service integrated in `docker-compose.ml.yml`
   - Proper health checks and restart policies
   - Volume mounts for development

### TikTok Video Extraction Research

1. **Current Limitation**
   - TikTok oEmbed API doesn't provide video URLs
   - Share processor only queues transcription when `media.url` exists
   - Attempted HTML scraping blocked by anti-bot measures

2. **Attempted Solution**
   - Enhanced TikTok fetcher with Cheerio HTML parsing
   - Tried extracting from SIGI_STATE and UNIVERSAL_DATA
   - Result: TikTok returns verification/captcha page

3. **Recommended Approach: yt-dlp Integration**
   ```
   Plan for yt-dlp subprocess:
   - Add yt-dlp to api-gateway Docker image
   - Create YtDlpService for video extraction
   - Use child_process.spawn for subprocess control
   - Cache results in Redis
   - Implement proper security and timeouts
   ```

### Pending Tasks

1. **Week 1.5 Tasks**
   - Cost Budget Ceiling (whisper-6)
   - Pre-flight Checks (whisper-7)
   - Silence Detection (whisper-8)

2. **Week 2 Tasks**
   - Enhanced cost tracking
   - Prometheus metrics
   - Grafana dashboards
   - Analytics API endpoints

3. **TikTok Integration** ✓
   - Implemented yt-dlp service
   - Updated TikTok fetcher to extract video URLs
   - Enable automatic transcription for TikTok videos

### yt-dlp Integration Implementation ✓ TESTED & WORKING

1. **Infrastructure**
   - Created Dockerfile for api-gateway with yt-dlp installation
   - Added Python3, pip, and ffmpeg dependencies
   - Configured for both development and production stages
   - **Local Installation**: `brew install yt-dlp` or `pip3 install yt-dlp`

2. **YtDlpService Implementation**
   - Created `/packages/api-gateway/src/modules/shares/services/ytdlp.service.ts`
   - Features:
     - Subprocess execution with timeout (30s)
     - URL sanitization for security
     - Redis caching with 1-hour TTL
     - Metrics tracking (requests, cache hits, success rate)
     - Proper error handling and logging

3. **Security Measures**
   - URL validation (only HTTP/HTTPS allowed)
   - Command injection prevention
   - `--no-playlist` flag to prevent bulk downloads
   - Process timeout to prevent hanging
   - Non-root user in production Docker image

4. **TikTok Fetcher Updates**
   - Integrated YtDlpService for video extraction
   - Falls back gracefully when extraction fails
   - Includes extracted video URL and duration in response
   - Automatic transcription task queuing when URL available

5. **Performance Optimizations**
   - Redis caching to avoid repeated extractions
   - URL hashing for cache keys
   - Metrics for monitoring performance
   - Configurable timeout values

### Production Test Results (June 24, 2025)

Successfully tested end-to-end TikTok transcription:
- **TikTok URL**: `@loewhaley/video/7501788637290368311`
- **yt-dlp extraction**: 3.2 seconds (extracted actual video URL)
- **Video duration**: 40.4 seconds
- **Transcription cost**: $0.0040 (correct at $0.006/minute)
- **Total processing time**: 11.3 seconds
- **Generated**: 23 transcript segments with timestamps
- **Full pipeline**: TikTok URL → Video extraction → Download → Audio processing → Transcription → Database

**Minor fix needed**: Run `pnpm -w run db:migrate` to create transcription_costs table

## Notes for Future Implementation

1. **Vector Service**
   - New service for ml.embed queue
   - Consider batch processing for efficiency
   - Store embeddings in pgvector

2. **Monitoring**
   - Flower is configured but optional (profile: monitoring)
   - Consider Prometheus metrics export
   - Add custom metrics for ML-specific operations

3. **Performance Tuning**
   - Current settings: concurrency=4, prefetch=8, max-tasks=50
   - Adjust based on actual workload
   - Monitor memory usage with worker recycling