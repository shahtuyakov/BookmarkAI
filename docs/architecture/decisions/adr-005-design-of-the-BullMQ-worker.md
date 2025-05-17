# ADR 005: Design of the **BullMQ Worker (share.process)** for BookmarkAI MVP

* **Status**: Proposed  
* **Date**: 2025-05-17  
* **Authors**: @shokhzodjon-tuyokov, @bookmarkai-core  
* **Supersedes**: —  
* **Superseded by**: —  

---

## 1 — Context

Task 1.5 must turn the existing queue stub into a working "echo" processor that:
1. Logs the URL being processed (proof the worker is alive).  
2. Transitions the share's `status` from **processing → done**.  

This is only a simulation for Phase 1, but it must be expandable in Phase 2 when real scraping / ML kicks in.

Current code status (≈ 15% complete):
* `BullModule` registered globally.  
* `ShareProcessor` class exists and sets `status = 'processing'`.  
* Job insertion (`this.shareQueue.add()`) is wired from the controller.  

## 2 — Decision

| Concern | Decision |
|---------|----------|
| **Queue name** | `share.process` (already in code) |
| **Processor behaviour** | • Log `Processing <url>` at `info` level.<br>• `await delay(configService.get('WORKER_DELAY_MS', 5000))` to simulate work.<br>• Update DB row `status = 'done'`.<br>• Return `{ id, url, status:'done' }` for test visibility. |
| **Retry strategy** | `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`. Different strategies can be configured per error type in Phase 2. |
| **Error handling** | • DB errors: Throw to retry, log detailed error.<br>• Redis errors: Log and alert, trigger failover.<br>• Transient network issues: Retry with backoff.<br>• Permanent failures: Move to dead-letter queue after max attempts. |
| **Timeout** | `timeout: configService.get('WORKER_TIMEOUT_MS', 30000)`; job auto-fails if worker hangs. |
| **Rate limiting** | MVP: Default (one job/sec).<br>Phase 2: Platform-specific throttling based on API limits. |
| **Concurrency** | `concurrency: configService.get('WORKER_CONCURRENCY', 3)` - process 3 shares simultaneously (configurable). |
| **Job cleanup** | • Completed jobs: Retain 24 hours.<br>• Failed jobs: Retain 7 days.<br>• Use `removeOnComplete: { age: 86400 }` and `removeOnFail: { age: 604800 }`. |
| **Test harness** | Integration test spawns in-memory Redis (testcontainers), enqueues job, waits for completion, asserts status. |
| **Extensibility hooks** | • Core logic in `ShareProcessor.processShare()`.<br>• Add `ShareProcessor.processPlatformContent(platform, url)` for Phase 2 platform-specific processing.<br>• Phase 2: Strategy pattern for platform-specific processors. |

## 3 — Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A. BullMQ stub with configurable delay (chosen)** | Fast to ship; demo-friendly; identical plumbing to future work; configurable for tests and production. | Does no real work yet. |
| **B. Synchronous update in controller** | Simplest; no worker infra. | Hides queue latency; can't evolve into heavy async pipeline. |
| **C. External Python worker via Redis/Amqp** | Closer to Phase 3 reality. | Overkill now; adds cross-lang complexity early. |

## 4 — Rationale

* **Consistency**: Uses BullMQ that we'll keep for Phase 2 fetchers.  
* **Observability early**: Logging + Bull Board lets devs see jobs in flight.  
* **Configurability**: Environment variables for critical settings enable easy testing and production tuning.
* **Low risk**: Configurable delay avoids accidental rapid-fire retries but can be short enough for automated tests.
* **Structured growth**: Strategy pattern allows clean platform-specific processing in Phase 2.

## 5 — Consequences

* **Work triggered**  
  * Finish `ShareProcessor.processShare()` implementation as per decision.  
  * Add `bullboard` dev dependency and `/admin/queues` route in `AppModule` (dev-only).
  * Add Prometheus metrics for queue depth and processing times.
  * Configure alert thresholds for queue backlogs and failed jobs.
  * Write Jest e2e test with testcontainers-redis.  

* **Future impact**  
  * Replacing the `delay()` with real platform fetchers only requires implementing platform-specific processors.
  * Retry/back-off settings can be tuned per-platform in Phase 2.
  * Monitoring foundation enables early detection of scaling issues.

## 6 — Data Flow

```
┌─────────┐     ┌───────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│ API     │     │ Redis │     │ Worker  │     │ Postgres│     │ Metrics  │
│ Gateway │ ──► │ Queue │ ──► │ Process │ ──► │ DB      │ ──► │ Dashboard│
└─────────┘     └───────┘     └─────────┘     └─────────┘     └──────────┘
    │                             │                │               ▲
    │                             │                │               │
    └─────────────────────────────┴───────────────────────────────┘
              Logging & Monitoring Flow
```

## 7 — Monitoring Strategy

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Queue depth | >100 for >5min | Warning |
| Processing time | >5s avg | Warning |
| Failed jobs | >5% rate | Critical |
| Worker crashes | Any | Critical |

## 8 — Links

* Prototype commit ➜  
* ADR 0003 ➜ /shares endpoint requirements.  
* BullMQ retries doc ➜ external.
* [BullMQ Documentation](https://docs.bullmq.io/) — Official docs