# ADR‑025: Python ML Micro‑service Framework & Messaging Architecture

* **Status**: **Proposed**
* **Date**: 2025‑06‑22
* **Authors**: @bookmarkai‑backend, @bookmarkai‑ml
* **Supersedes**: —
* **Superseded by**: —
* **Related**: ADR‑005 (BullMQ Worker), ADR‑014 (Enhanced Idempotency), ADR‑021 (Content Fetcher Interface)

---

## 1 — Context

Phase 2 introduces caption extraction and other ML pipelines that must run outside the Node.js API.  We already defer heavy work to a BullMQ worker (ADR‑005) and guarantee duplicate‑request protection in the API layer (ADR‑014).  What we still lack is a **durable, language‑agnostic task framework** that lets the Node orchestrator dispatch long‑running GPU / CPU jobs to Python services running Whisper, LLM summarisation, and vector‑embedding models.

Key requirements:

| Need                     | Detail                                                      |
| ------------------------ | ----------------------------------------------------------- |
| **Cross‑language queue** | Node publishes ▸ Python consumes without a fragile shim.    |
| **Durability & HA**      | Tasks survive broker restarts; no silent drops.             |
| **Workload isolation**   | Long GPU jobs must not starve short text jobs.              |
| **Duplicate protection** | Share‑sheet double‑fires must never burn GPU twice.         |
| **Observability**        | End‑to‑end tracing & metrics across Node → broker → Celery. |
| **Maintainability**      | Minimal bespoke glue; clear upgrade path as workloads grow. |

The task map names this as **Task 2.5**: “Set up Python micro‑service framework (Celery + aio‑pika) – prevent duplicate processing when share‑sheet double‑fires”.

---

## 2 — Decision

We will:

1. **Adopt RabbitMQ 3 (quorum queues) as the cross‑language message broker.**

   * Provides persistence, high‑availability clustering, native metrics, and mature client libraries for both Node and Python.
2. **Use Celery 5.3 in Python workers with JSON serialisation** and **aio‑pika** AMQP driver.

   * Celery’s task routing, retries, and monitoring fit our ML workload; aio‑pika offers async I/O for future real‑time tasks.
3. **Publish Celery‑format tasks directly from Node** via the \`\` library (AMQP producer) using JSON payloads.

   * Avoids an extra “bridge” micro‑service; Node becomes a first‑class Celery producer.
4. **Create dedicated queues per workload class**

   * `ml.transcribe` (GPU‑heavy), `ml.summarize` (CPU‑light), `ml.embed` (CPU‑heavy).
   * Each queue has its own Celery worker pool / autoscaling policy.
5. **Enforce duplicate suppression at two layers**

   * **Upstream**: existing Redis/Postgres idempotency keys (ADR‑014).
   * **Worker‑side**: **celery‑singleton** Redis locks keyed by `hash(share_id + task_type)`; duplicate tasks exit early returning existing result.
6. **Persist results directly to Postgres (**\`\`\*\* table)\*\* and update share status.

   * Keeps Node stateless and allows simple polling / subscription patterns.
7. **Instrument both producer and consumer with OpenTelemetry** using W3C Trace Context propagated in AMQP headers.
8. **Deploy RabbitMQ as a three‑node quorum cluster**  (K8s StatefulSet in EKS for prod; single‑node container for local/dev).

   * Tasks and queue definitions are durable; messages survive node restarts.

---

## 3 — Details

### 3.1 Message Contract (v1.0)

```jsonc
{
  "version": "1.0",
  "taskType": "transcribe_whisper",        // routeKey determines queue
  "shareId": "<uuid>",
  "payload": {
    "mediaUrl": "s3://…/video.mp4",
    "language": null                      // allow auto‑detect
  },
  "metadata": {
    "correlationId": "<uuid>",           // Node request ID
    "timestamp": 1719078000,
    "retryCount": 0
  }
}
```

*Serialiser*: `application/json` (Celery JSON backend).  *Versioning*: bump minor for additive fields, major for breaking changes.

### 3.2 Queue & Worker Topology

| Queue                                                        | Binding key          | Worker image                | Concurrency | Node selector                     |
| ------------------------------------------------------------ | -------------------- | --------------------------- | ----------- | --------------------------------- |
| `ml.transcribe`                                              | `transcribe_whisper` | `bookmarkai/worker-whisper` | 1           | GPU nodes (`nvidia.com/gpu=true`) |
| `ml.summarize`                                               | `summarize_llm`      | `bookmarkai/worker-llm`     | 4           | CPU pool                          |
| `ml.embed`                                                   | `embed_vectors`      | `bookmarkai/worker-vec`     | 4           | CPU pool                          |
| *Prefetch*: GPU queue `prefetch=1`; CPU queues `prefetch=8`. |                      |                             |             |                                   |

### 3.3 Duplicate Protection Flow

1. **API** receives share request ⇒ computes idempotency key ⇒ stores in Redis & Postgres.
2. **Node (BullMQ)** enqueues RabbitMQ message **only if key absent**.
3. **Celery task** acquires `celery‑singleton` Redis lock on `dedup:<shareId>:<taskType>`.
4. Task proceeds if lock acquired; else returns existing result.

### 3.4 Result Persistence

```sql
CREATE TABLE ml_results (
  id              UUID PRIMARY KEY,
  share_id        UUID REFERENCES shares(id),
  task_type       TEXT,
  result_data     JSONB,
  model_version   TEXT,
  processing_ms   INTEGER,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

Python workers `INSERT … ON CONFLICT (share_id, task_type) DO UPDATE`.
Node API joins this table in `/shares/:id` responses.

### 3.5 Observability

* **Tracing**: OTel SDK (Node, Python); CeleryInstrumentor; Jaeger backend.
* **Metrics**: RabbitMQ Prometheus plugin; Celery metrics via OTel Meter; Grafana dashboards for queue depth, task duration, GPU utilisation.
* **Alerting**: PagerDuty if `queue_depth > 100` for `ml.transcribe` or `task_fail_rate > 5%` over 5 min.

---

## 4 — Options Considered

| Option                                   | Pros                                                                                       | Cons                                                                          | Outcome                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------- |
| **RabbitMQ + Celery (chosen)**           | Durable, HA quorum queues; built‑in routing; mature Celery ecosystem; strong observability | Extra infra component; need AMQP client in Node                               | **✔ Selected**            |
| **Redis as Celery broker**               | Zero new infra; easy local setup                                                           | No HA without Sentinel; risk of task loss on crash; queue metrics limited     | ✖ Rejected for production |
| **BullMQ spawning Python child‑process** | Simplest infra; no new broker                                                              | Ties Node worker to Python runtime; poor isolation; scaling across hosts hard | ✖ Rejected                |
| **HTTP micro‑API between Node→Python**   | Language‑agnostic; no broker                                                               | Blocking calls; retries brittle; no queue back‑pressure                       | ✖ Rejected                |

---

## 5 — Consequences

### Positive

* **Resilient pipeline** – tasks stored durably, HA across AZs.
* **Clear scaling knobs** – add workers per queue; isolate GPU load.
* **End‑to‑end observability** – unified tracing and metrics across languages.
* **Future‑proof** – same pattern extends to Phase 3 (summaries, embeddings).

### Negative / Risks

* **Operational cost** – new broker to monitor & patch.
* **Learning curve** – team must grok RabbitMQ & Celery concurrency knobs.
* **celery‑node maintenance** – community lib may lag; fallback is raw AMQP publish.

Mitigations: cluster via Helm (automated upgrades), internal run‑book for RabbitMQ, pin `celery‑node` to vetted commit and add integration test.

---

## 6 — Implementation Roadmap

| Week | Deliverable                                                                        |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | Helm deploy RabbitMQ cluster (dev & staging); enable Prom plugin.                  |
| 1    | Create `python/common/celery_app.py` with JSON serializer, queues, singleton lock. |
| 1    | Node: integrate `celery-node` producer; publish to `ml.*` queues.                  |
| 2    | Implement Whisper worker (GPU pod); write to `ml_results`.                         |
| 2    | Add OTel tracing in Node publish & Celery worker.                                  |
| 3    | Implement LLM summarise worker; autoscaling via KEDA on `ml.summarize`.            |
| 3    | Dashboards + alerts on queue depth, task latency, error rate.                      |

---

## 7 — Open Issues / Follow‑ups

1. **Secret management** – RabbitMQ creds in Vault; Python workers auto‑inject.
2. **Data EU residency** – confirm Whisper transcripts stored within allowed region.
3. **GPU quota** – capacity planning for expected transcript load in Phase 3.

---

## 8 — Decision

We will **deploy RabbitMQ quorum cluster and Celery JSON workers, with Node acting as Celery producer, queue‑per‑workload routing, and dual‑layer deduplication** as the Phase 2 MVP architecture for BookmarkAI ML pipelines.  This balances near‑term simplicity with production‑grade durability and sets the foundation for Phase 3’s heavier AI workloads.

Below is a concise “Implementation Guide” you can append after **Section 7 — Open Issues** in ADR-025 (or keep as a separate run-book).  It breaks the decision down into concrete, check-box-ready steps so any engineer can spin the new stack up without hunting for tribal knowledge.

---

## 9 — Implementation Guide (Step-by-Step)

> \*\*Tip \*\*: run each block end-to-end in *dev* before promoting to staging/prod.

### 9.1 Infrastructure Provisioning

| Step      | Command / File                                             | Notes                                                                                                                      |
| --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **9.1.1** | `infra/helm/rabbitmq/values.yaml`                          | Copy Bitnami RabbitMQ chart; set `replicaCount: 3`, `auth.username: ml`, `quorumQueues.enabled: true`, enable Prom plugin. |
| **9.1.2** | `make infra-dev`                                           | Deploy RabbitMQ to dev namespace.                                                                                          |
| **9.1.3** | `aws secretsmanager put-secret-value …`                    | Store `RABBITMQ_URI` (`amqps://ml:<pwd>@rabbitmq.dev.svc:5672/`).                                                          |
| **9.1.4** | Add Rabbit health-check to `monitoring/rules/rabbitmq.yml` | Alert if `rabbitmq_up == 0` or `queue_messages_ready > 200` for 5 m.                                                       |

### 9.2 Python Worker Skeleton

```bash
# python/common/celery_app.py
from celery import Celery
from celery_singleton import Singleton

celery = Celery(
    "bookmarkai",
    broker=os.getenv("RABBITMQ_URI"),
    backend="rpc://",
    task_serializer="json",
    result_serializer="json",
)
celery.conf.task_queues = (
    Queue("ml.transcribe", routing_key="transcribe_whisper", queue_arguments={"x-queue-type": "quorum"}),
    Queue("ml.summarize",  routing_key="summarize_llm",      queue_arguments={"x-queue-type": "quorum"}),
    Queue("ml.embed",      routing_key="embed_vectors",      queue_arguments={"x-queue-type": "quorum"}),
)
celery.conf.task_routes = {
    "tasks.transcribe_whisper": {"queue": "ml.transcribe"},
    "tasks.summarize_llm":      {"queue": "ml.summarize"},
    "tasks.embed_vectors":      {"queue": "ml.embed"},
}
```

* **Singleton lock**: add `@celery.task(base=Singleton, …)` on each ML task.
* Put common logging/OTel init in `worker_process_init` signal.

### 9.3 Node → Rabbit Producer

1. **Install**: `npm i @golevelup/nestjs-celery` *or* `npm i celery-node` (pin commit).
2. **Config** (NestJS example):

```ts
CeleryModule.forRoot({
  defaultQueue: 'ml.transcribe',
  brokerUrl : process.env.RABBITMQ_URI,
  serializer: 'json'
});
```

3. **Publish**:

```ts
await this.celeryService.sendTask(
  'tasks.transcribe_whisper',
  [{ mediaUrl, language }],
  { correlationId, taskId: sha1(shareId + 'transcribe') }
);
```

### 9.4 Database Migration

```sql
-- db/migrations/V20250622__ml_results.sql
CREATE TABLE ml_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES shares(id),
  task_type TEXT NOT NULL,
  result_data JSONB,
  model_version TEXT,
  processing_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (share_id, task_type)
);
```

### 9.5 Whisper Worker (GPU)

```dockerfile
# docker/python/worker-whisper/Dockerfile
FROM pytorch/torchserve:23.05-py3
RUN pip install --no-cache-dir celery==5.3 aio-pika==9.4 celery-singleton==0.3 whisper-openai==1.2
COPY models/ /models/
COPY python/common /app/common
CMD ["celery", "-A", "common.celery_app", "worker",
     "-Q", "ml.transcribe", "--concurrency=1", "--prefetch-multiplier=1"]
```

* Deploy with `requests.cpu=500m`, `requests.nvidia.com/gpu=1`.

### 9.6 Observability

```yaml
# opentelemetry-collector-config.yaml (snippet)
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }
exporters:
  logging: {}
  jaeger:
    endpoint: jaeger-collector.monitoring:14250
service:
  pipelines:
    traces:
      receivers: [ otlp ]
      processors: [ batch ]
      exporters: [ jaeger, logging ]
```

* **Node tracer**: `@opentelemetry/sdk-node`
* **Python tracer**: `opentelemetry-instrumentation-celery`

### 9.7 Autoscaling (KEDA snippet)

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: transcribe-scaler
spec:
  scaleTargetRef:
    name: worker-whisper
  triggers:
  - type: rabbitmq
    metadata:
      queueName: ml.transcribe
      host: RABBITMQ_URI
      protocol: amqp
      mode: QueueLength
      value: "25"
```

---

## 10 — Checklist for “Done”

* [ ] **RabbitMQ dev cluster** running; `ml.*` queues declared as quorum.
* [ ] **celery\_app.py** committed with routing + singleton lock.
* [ ] **Node producer** publishes `tasks.transcribe_whisper` and sees ack in Rabbit.
* [ ] **Whisper worker** consumes a dummy task, writes row into `ml_results`.
* [ ] **OpenTelemetry trace** visible in Jaeger from API call → Celery task.
* [ ] **Alerts** fire if `ml.transcribe` depth > 100 for 5 min.
* [ ] **Docs** updated: local dev instructions (`docker compose up rabbitmq && poetry run celery -A …`).

Once these boxes tick ✓, ADR-025 can be marked **Accepted**.

