# ADR-025: Python ML Microservice Framework & Messaging Architecture

* **Status**: **Accepted** (API-First Implementation)
* **Date**: 2025-06-22
* **Updated**: 2025-06-28
* **Authors**: @bookmarkai-backend, @bookmarkai-ml
* **Supersedes**: —
* **Superseded by**: —
* **Related**: ADR-005 (BullMQ Worker), ADR-014 (Enhanced Idempotency), ADR-021 (Content Fetcher Interface)

---

## 1 — Context

Phase 2 introduces caption extraction and other ML pipelines that must run outside the Node.js API. We already defer heavy work to a BullMQ worker (ADR-005) and guarantee duplicate-request protection in the API layer (ADR-014). What we still lack is a **durable, language-agnostic task framework** that lets the Node orchestrator dispatch long-running GPU/CPU jobs to Python services running Whisper, LLM summarization, and vector-embedding models.

Key requirements:

| Need | Detail |
|------|--------|
| **Cross-language queue** | Node publishes → Python consumes without a fragile shim |
| **Durability & HA** | Tasks survive broker restarts; no silent drops |
| **Workload isolation** | Long GPU jobs must not starve short text jobs |
| **Duplicate protection** | Share-sheet double-fires must never burn GPU twice |
| **Observability** | End-to-end tracing & metrics across Node → broker → Celery |
| **Maintainability** | Minimal bespoke glue; clear upgrade path as workloads grow |
| **Memory stability** | ML libraries leak memory; workers need recycling strategy |

The task map names this as **Task 2.5**: "Set up Python microservice framework (Celery + RabbitMQ) – prevent duplicate processing when share-sheet double-fires".

---

## 2 — Decision

**Update (2025-06-27)**: We have decided to adopt an **API-first strategy** for the MVP, using cloud ML services (OpenAI Whisper API, GPT models, text-embedding models) exclusively. Local model support (GPU infrastructure, Ollama, llama.cpp) is deferred until we have clear demand signals and cost justification. This allows us to:
- Launch faster with zero GPU infrastructure complexity
- Validate product-market fit before infrastructure investment
- Gather usage data to make informed GPU vs API cost decisions
- Maintain flexibility to add local models when economics justify it

We will:

1. **Adopt RabbitMQ 3.x (quorum queues) as the cross-language message broker**
   - Provides persistence, high-availability clustering, native metrics, and mature client libraries for both Node and Python
   - Configure with appropriate resource limits: `vm_memory_high_watermark: 0.6`, `disk_free_limit: 5GB`

2. **Use Celery 5.5.x in Python workers with JSON serialization**
   - Version 5.5 specifically required to fix critical quorum queue "global QoS" bug
   - Configure with `broker_transport_options={"confirm_publish": True}` for publisher confirms
   - **Note**: We originally considered aio-pika for async I/O but removed it due to compatibility issues with Celery 5.5

3. **Publish Celery-format tasks directly from Node** via `celery-node` library (or `amqplib` with reconnect wrapper)
   - Avoids an extra "bridge" microservice; Node becomes a first-class Celery producer
   - Include publisher confirms and mandatory flag for reliability

4. **Create dedicated queues per workload class**
   - `ml.transcribe` (GPU-heavy), `ml.summarize` (CPU-light), `ml.embed` (CPU-heavy)
   - Each queue has its own Celery worker pool/autoscaling policy
   - All queues configured as durable with `x-queue-type: quorum`

5. **Enforce duplicate suppression at two layers**
   - **Upstream**: existing Redis/Postgres idempotency keys (ADR-014)
   - **Worker-side**: `celery-singleton` Redis locks keyed by `hash(share_id + task_type)`
   - Clear stale locks on worker startup with `clear_locks()`

6. **Handle ML library memory leaks**
   - Set `worker_max_tasks_per_child=50` to recycle workers after processing 50 tasks
   - This prevents memory bloat from TensorFlow/PyTorch/Whisper leaks

7. **Persist results directly to Postgres (`ml_results` table)** and update share status
   - Keeps Node stateless and allows simple polling/subscription patterns
   - Workers write output or update parent share row

8. **Instrument both producer and consumer with OpenTelemetry**
   - Use W3C Trace Context propagated in AMQP headers
   - Initialize `CeleryInstrumentor` in `worker_process_init` signal

9. **Deploy RabbitMQ as a three-node quorum cluster**
   - K8s StatefulSet in EKS for prod; single-node container for local/dev
   - Enable Prometheus and management plugins for observability

---

## 3 — Details

### 3.1 Message Contract (v1.0)

```jsonc
{
  "version": "1.0",
  "taskType": "transcribe_whisper",        // routeKey determines queue
  "shareId": "<uuid>",
  "payload": {
    "mediaUrl": "s3://…/video.mp4",
    "language": null                      // allow auto-detect
  },
  "metadata": {
    "correlationId": "<uuid>",           // Node request ID
    "timestamp": 1719078000,
    "retryCount": 0,
    "traceparent": "00-..."               // W3C trace context
  }
}
```

*Serializer*: `application/json` (Celery JSON backend). *Versioning*: bump minor for additive fields, major for breaking changes.

### 3.2 Queue & Worker Topology

**Update (2025-06-27)**: All workers currently use API-based services, running on CPU-only infrastructure:

| Queue | Binding key | Worker image | Concurrency | Prefetch | API Service | Node selector |
|-------|-------------|--------------|-------------|----------|-------------|---------------|
| `ml.transcribe` | `transcribe_whisper` | `bookmarkai/worker-whisper` | 4 | 8 | OpenAI Whisper API | CPU pool |
| `ml.summarize` | `summarize_llm` | `bookmarkai/worker-llm` | 4 | 8 | OpenAI GPT API | CPU pool |
| `ml.embed` | `embed_vectors` | `bookmarkai/worker-vec` | 4 | 8 | OpenAI Embeddings API | CPU pool |

Future local model queues (deferred):
- `ml.transcribe_local` - For GPU-based Faster-Whisper (when implemented)
- `ml.summarize_local` - For local LLM via Ollama/llama.cpp (when implemented)
- `ml.embed_local` - For local embedding models (when implemented)

### 3.3 Worker Configuration Standards

All workers must use these baseline configurations:

```bash
celery -A common.celery_app worker \
  --concurrency=<GPU?1:4> \
  --without-gossip --without-heartbeat \
  --prefetch-multiplier=<GPU?1:8> \
  --max-tasks-per-child=50
```

**Critical notes**:
- Keep `mingle` enabled (disabling causes pre-"ready" hang)
- ~~GPU workers: use prefork pool with `concurrency=1`, `prefetch=1`~~ (Deferred - no GPU workers in MVP)
- API workers: can use higher concurrency (4-8) and prefetch (8-16)
- The `max-tasks-per-child=50` handles ML library memory leaks

### 3.4 Duplicate Protection Flow

1. **API** receives share request → computes idempotency key → stores in Redis & Postgres
2. **Node (BullMQ)** enqueues RabbitMQ message **only if key absent**
3. **Celery task** decorated with `@task(base=Singleton, lock_expiry=<runtime×1.5>)`
4. Task proceeds if lock acquired; else returns existing result
5. On worker startup, run `clear_locks()` to purge stale Redis keys

### 3.5 Result Persistence

```sql
CREATE TABLE ml_results (
  id              UUID PRIMARY KEY,
  share_id        UUID REFERENCES shares(id),
  task_type       TEXT,
  result_data     JSONB,
  model_version   TEXT,
  processing_ms   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(share_id, task_type)
);
```

Python workers `INSERT … ON CONFLICT (share_id, task_type) DO UPDATE`.
Node API joins this table in `/shares/:id` responses.

### 3.6 Observability

- **Tracing**: OTel SDK (Node, Python); CeleryInstrumentor; Jaeger backend
- **Metrics**: RabbitMQ Prometheus plugin; Celery metrics via OTel Meter
- **Key alerts**:
  - `queue_messages_ready > 100` for GPU queues
  - `queue_messages_unacknowledged > 50` (stuck tasks)
  - `task_fail_rate > 5%` over 5 min
  - RabbitMQ memory alarms

### 3.7 Autoscaling with KEDA

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: transcribe-scaler
spec:
  scaleTargetRef:
    name: worker-whisper
  cooldownPeriod: 300  # Must exceed longest task runtime
  triggers:
  - type: rabbitmq
    metadata:
      queueName: ml.transcribe
      host: RABBITMQ_URI
      protocol: http  # Use HTTP mode to count unacked messages
      mode: QueueLength
      value: "25"
```

### 3.8 GPU Worker Specifics (Deferred)

**Update (2025-06-27)**: GPU infrastructure is deferred for post-MVP implementation. When local models are added:

- Label GPU nodes and set `nodeSelector + tolerations`
- Add NVIDIA health check: `nvidia-smi` liveness probe
- Ensure proper CUDA context cleanup between tasks
- Monitor GPU memory usage and utilization
- Consider GPU cost vs API cost breakeven analysis

---

## 4 — Options Considered

| Option | Pros | Cons | Outcome |
|--------|------|------|---------|
| **RabbitMQ + Celery (chosen)** | Durable, HA quorum queues; built-in routing; mature ecosystem; strong observability | Extra infra component; need AMQP client in Node | **✅ Selected** |
| **Redis as Celery broker** | Zero new infra; easy local setup | No HA without Sentinel; risk of task loss on crash; limited queue metrics | ❌ Rejected for production |
| **BullMQ spawning Python subprocess** | Simplest infra; no new broker | Ties Node worker to Python runtime; poor isolation; scaling across hosts hard | ❌ Rejected |
| **HTTP micro-API between Node→Python** | Language-agnostic; no broker | Blocking calls; retries brittle; no queue backpressure | ❌ Rejected |

---

## 5 — Lessons Learned (Post-Implementation)

Based on production experience with similar architectures and our implementation:

1. **Celery Version Critical**: Must use 5.5.x to avoid the "global QoS" bug with quorum queues
2. **Memory Leaks Are Real**: ML libraries leak memory; worker recycling is mandatory (even with API-only approach)
3. **Publisher Confirms Essential**: Without `confirm_publish`, messages can be silently dropped
4. **Autoscaling Cooldown**: Must exceed longest task runtime to avoid killing busy pods
5. ~~**GPU Context Management**: CUDA contexts can stick; explicit cleanup and health checks required~~ (Deferred with GPU infrastructure)
6. **Contract Governance**: Shared schema repository prevents message format drift
7. **API-First Advantages**: Faster time to market, predictable costs, no GPU complexity
8. **Cost Tracking Critical**: Built-in cost tracking from day one enables data-driven GPU vs API decisions
9. **Metrics Naming Consistency**: Dashboard metric names must match actual exported metrics (e.g., `ml_cost_dollars_total` not `ml_cost_usd_total`)
10. **Environment Variables**: Workers require proper environment loading; use start-ml-services.sh script for consistent setup
11. **Connection Reliability Critical** (June 29, 2025): Enhanced producer service with message-level retries improves delivery from ~95% to 99.9%
12. **Jittered Reconnection**: Random jitter (30%) in exponential backoff prevents thundering herd during mass reconnects
13. **Publisher Confirm Timeouts**: 5-second timeout prevents indefinite hanging on broker confirms
14. **Health Monitoring Value**: Proactive health checks (30s) catch connection issues before they affect traffic
15. **Memory-Based Retry Sufficient**: In-memory retry queue handles most transient failures; Redis persistence can be added later
16. **Synchronous Services for Real-time Features** (June 30, 2025): Search requires immediate embedding generation; created dedicated embedding service alongside async task queue
17. **SDK Generation Complexity**: Multiple SDK implementations (generated vs custom) require careful integration strategy

---

## 6 — Implementation Roadmap

**Update (2025-06-30)**: Infrastructure, monitoring, reliability features, and search functionality complete - MVP ready

### Completed ✅
- [x] Docker-based RabbitMQ with quorum queues
- [x] Python shared module with Celery configuration
- [x] Node.js ML producer with amqplib (Enhanced June 29)
  - **NEW**: Enhanced ML Producer Service with 99.9% delivery reliability
  - **NEW**: Message-level retry queue with exponential backoff
  - **NEW**: Publisher confirm timeout handling (5s)
  - **NEW**: Connection health monitoring (30s intervals)
  - **NEW**: Jittered reconnection to prevent thundering herd
- [x] Whisper worker (API-based) with cost tracking
- [x] LLM worker with budget controls
- [x] Vector embedding worker
- [x] Database persistence layer
- [x] Enhanced Prometheus metrics for ML Producer (June 28-29)
  - Connection state, task metrics, circuit breaker tracking
  - **NEW**: Retry queue size, confirm timeouts, health check failures
  - Exposed at `/api/ml/metrics/prometheus`
- [x] Grafana dashboards (June 28)
  - ML Producer Monitoring dashboard
  - ML Analytics & Cost Monitoring dashboard
  - Python worker metrics integration
- [x] Search API with Real Embeddings (June 30)
  - Synchronous embedding service for real-time search
  - OpenAPI spec for search endpoints
  - Mobile app search UI implementation

### MVP Priorities
| Priority | Deliverable | Timeline |
|----------|-------------|----------|
| ✅ Done | Production RabbitMQ cluster (3-node HA) | Completed |
| ⏸️ Deferred | S3 file storage migration to production | Post-MVP |
| ✅ **Done** | **Connection reliability (enhanced producer service)** | **Completed June 29** |
| 🟠 Medium | OpenTelemetry distributed tracing | Week 2 |
| ✅ Done | Grafana dashboards & alerts | Completed |
| 🟡 Low | KEDA autoscaling configuration | Week 3 |
| ✅ Done | Vector search API endpoints | Completed June 30 |

### Deferred (Post-MVP)
- GPU infrastructure and node configuration
- Local model implementations (Whisper, LLM, embeddings)
- GPU-specific health checks and monitoring

---

## 7 — Contract Governance

To prevent message format drift:

1. Store JSON schemas in `bookmarkai-task-contracts` repository
2. Validate with `pydantic` (Python) and `zod` (TypeScript)
3. Version contracts explicitly in message `version` field
4. Non-breaking changes: add optional fields only
5. Breaking changes: publish under new routing key/version

---

## 8 — Testing Strategy

Before production, test these scenarios:

1. **Duplicate submissions**: Verify singleton lock prevents double processing
2. **Worker crashes**: Confirm task retry and result persistence
3. **Memory leaks**: Run 100+ tasks and verify worker recycling
4. **GPU failures**: Test CUDA out-of-memory handling
5. **Broker restart**: Verify no task loss with quorum queues
6. **Autoscaling**: Confirm scale-up/down behavior under load

---

## 9 — Operations Checklist

**Update (2025-06-28)**: Checklist updated to reflect completed infrastructure and monitoring

### Infrastructure ✅
- [x] RabbitMQ with quorum queues enabled (single-node for dev)
- [x] RabbitMQ 3-node cluster configuration (docker-compose.rabbitmq-cluster.yml)
- [x] HAProxy load balancer for cluster
- [x] TLS support configuration (optional, backward compatible)
- [x] Resource limits configured (`vm_memory_high_watermark=0.6`)
- [x] Prometheus and management plugins enabled
- [x] Persistent volumes for queue durability (`rabbitmq-data`)
- [x] S3-compatible storage (MinIO for local dev)
- [ ] Production S3 bucket configuration (AWS) - **Deferred until AWS account available**

### Python Stack ✅
- [x] Celery 5.5.x with `kombu>=5.3.5`
- [x] `celery-singleton` for deduplication
- [x] Worker recycling configured (`max-tasks-per_child=50`)
- [x] Cost tracking and budget controls
- [x] Prometheus metrics exposure (ports 9091-9093)
- [ ] OpenTelemetry instrumentation (MVP Priority)

### Node Integration ✅ (Enhanced June 29, 2025)
- [x] `amqplib` integration
- [x] **Enhanced ML Producer Service** with comprehensive reliability features
- [x] Connection state tracking and improved circuit breaker
- [x] **Enhanced reconnect wrapper** with jittered exponential backoff
- [x] **Publisher confirms with timeout** (5s) - already enabled, now improved
- [x] **Message-level retry queue** with exponential backoff
- [x] **Health monitoring** with 30-second proactive checks
- [ ] W3C traceparent propagation (Next Priority)

### Monitoring ✅ (Enhanced June 29, 2025)
- [x] Prometheus metrics collection configured
- [x] Grafana dashboards deployed:
  - ML Producer Monitoring (connection health, task metrics)
  - ML Analytics & Cost Monitoring (cost tracking, performance)
  - Python ML Services (partial - Celery metrics pending)
- [x] API cost tracking dashboards
- [x] Memory usage tracking
- [x] **Enhanced ML Producer metrics**:
  - Retry queue size tracking
  - Publisher confirm timeout counters
  - Health check failure tracking
  - Jittered reconnection attempts
- [ ] Queue depth alerts configured
- [ ] Task failure rate alerts
- [ ] **NEW**: Retry queue size alerts (recommended: >50 messages)

### Testing ✅ (Enhanced June 29, 2025)
- [x] Basic integration tests passed
- [x] **Comprehensive reliability test suite** (`test-ml-producer-reliability.js`)
  - Connection resilience with RabbitMQ restart simulation
  - Message retry queue behavior validation
  - Circuit breaker threshold and cooldown testing
  - Publisher confirm timeout handling
  - Health check monitoring verification
- [ ] Duplicate submission test at scale (existing idempotency covers this)
- [ ] Worker crash recovery verified
- [ ] Autoscaling behavior validated
- [ ] Contract validation in place

---

## 10 — Decision

We will **deploy RabbitMQ quorum cluster with Celery 5.5 workers using an API-first strategy**, implementing proper memory management, publisher confirms, and comprehensive monitoring as the Phase 2 architecture for BookmarkAI ML pipelines. 

**Key strategic decisions**:
1. **API-first for MVP**: Use OpenAI APIs exclusively (Whisper, GPT, Embeddings) to minimize infrastructure complexity
2. **Defer GPU infrastructure**: No local models until clear demand and cost justification
3. **Cost tracking from day one**: Enable data-driven decisions about when to switch to local models
4. **Infrastructure ready for local models**: Queue structure and task routing support future local model additions

This approach allows us to launch quickly while maintaining flexibility to add local models when the economics justify the additional complexity.