# ADR-025: Python ML Microservice Framework & Messaging Architecture

* **Status**: **Proposed**
* **Date**: 2025-06-22
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

| Queue | Binding key | Worker image | Concurrency | Prefetch | Node selector |
|-------|-------------|--------------|-------------|----------|---------------|
| `ml.transcribe` | `transcribe_whisper` | `bookmarkai/worker-whisper` | 1 | 1 | GPU nodes (`nvidia.com/gpu=true`) |
| `ml.summarize` | `summarize_llm` | `bookmarkai/worker-llm` | 4 | 8 | CPU pool |
| `ml.embed` | `embed_vectors` | `bookmarkai/worker-vec` | 4 | 8 | CPU pool |

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
- GPU workers: use prefork pool with `concurrency=1`, `prefetch=1`
- CPU workers: can use higher concurrency and prefetch
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

### 3.8 GPU Worker Specifics

- Label GPU nodes and set `nodeSelector + tolerations`
- Add NVIDIA health check: `nvidia-smi` liveness probe
- Ensure proper CUDA context cleanup between tasks
- Monitor GPU memory usage and utilization

---

## 4 — Options Considered

| Option | Pros | Cons | Outcome |
|--------|------|------|---------|
| **RabbitMQ + Celery (chosen)** | Durable, HA quorum queues; built-in routing; mature ecosystem; strong observability | Extra infra component; need AMQP client in Node | **✅ Selected** |
| **Redis as Celery broker** | Zero new infra; easy local setup | No HA without Sentinel; risk of task loss on crash; limited queue metrics | ❌ Rejected for production |
| **BullMQ spawning Python subprocess** | Simplest infra; no new broker | Ties Node worker to Python runtime; poor isolation; scaling across hosts hard | ❌ Rejected |
| **HTTP micro-API between Node→Python** | Language-agnostic; no broker | Blocking calls; retries brittle; no queue backpressure | ❌ Rejected |

---

## 5 — Lessons Learned (Pre-Implementation)

Based on production experience with similar architectures:

1. **Celery Version Critical**: Must use 5.5.x to avoid the "global QoS" bug with quorum queues
2. **Memory Leaks Are Real**: ML libraries (TensorFlow, PyTorch, Whisper) leak memory; worker recycling is mandatory
3. **Publisher Confirms Essential**: Without `confirm_publish`, messages can be silently dropped
4. **Autoscaling Cooldown**: Must exceed longest task runtime to avoid killing busy pods
5. **GPU Context Management**: CUDA contexts can stick; explicit cleanup and health checks required
6. **Contract Governance**: Shared schema repository prevents message format drift

---

## 6 — Implementation Roadmap

| Week | Deliverable |
|------|-------------|
| 1 | Helm deploy RabbitMQ cluster (dev & staging); enable Prometheus plugin |
| 1 | Create `python/common/celery_app.py` with JSON serializer, queues, singleton lock |
| 1 | Node: integrate `celery-node` producer with publisher confirms |
| 2 | Implement Whisper worker (GPU pod) with health checks; write to `ml_results` |
| 2 | Add OTel tracing in Node publish & Celery worker |
| 3 | Implement LLM summarize worker; KEDA autoscaling on `ml.summarize` |
| 3 | Dashboards + alerts on queue depth, task latency, error rate |
| 3 | Contract validation with shared schemas repository |

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

### Infrastructure
- [ ] RabbitMQ 3-node cluster with quorum queues enabled
- [ ] Resource limits configured (`vm_memory_high_watermark=0.6`)
- [ ] Prometheus and management plugins enabled
- [ ] Persistent volumes for queue durability

### Python Stack
- [ ] Celery 5.5.x with `kombu>=5.3.5`
- [ ] `celery-singleton` for deduplication
- [ ] Worker recycling configured (`max-tasks-per-child=50`)
- [ ] OpenTelemetry instrumentation

### Node Integration
- [ ] `celery-node` or `amqplib` with reconnect wrapper
- [ ] Publisher confirms enabled
- [ ] W3C traceparent propagation

### Monitoring
- [ ] Queue depth alerts configured
- [ ] Task failure rate alerts
- [ ] GPU utilization dashboards
- [ ] Memory usage tracking

### Testing
- [ ] Duplicate submission test passed
- [ ] Worker crash recovery verified
- [ ] Autoscaling behavior validated
- [ ] Contract validation in place

---

## 10 — Decision

We will **deploy RabbitMQ quorum cluster with Celery 5.5 workers, implementing proper memory management, publisher confirms, and comprehensive monitoring** as the Phase 2 architecture for BookmarkAI ML pipelines. This approach balances reliability with operational maintainability while addressing known production challenges upfront.