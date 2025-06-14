## ADR-014 — Idempotency MVP Checklist

### 1. Completed

#### Backend (api-gateway)

- [x] Feature flag `ENABLE_IDEMPOTENCY_IOS_MVP` wired via `ConfigService`.
- [x] Redis Lua script for atomic GET / placeholder-SET (24 h TTL).
- [x] Key namespacing `<env>:idempotency:<userId>:<uuid>`.
- [x] Response JSON cached via `storeResponse()`.
- [x] Jest unit tests (`idempotency.mvp.spec.ts`) + Jest config.
- [x] `tsconfig.json` excludes test & contract files from build.

#### Mobile SDK (@bookmarkai/sdk)

- [x] In-memory key cache (30 s reuse window per URL).
- [x] Automatic header injection (`Idempotency-Key`, `X-Client-Platform`, `X-Client-Version`).
- [x] Transient network retry loop (≤3 attempts, exponential back-off).

#### Tooling / Ops

- [x] `.env.example` placeholder for `ENABLE_IDEMPOTENCY_IOS_MVP`.
- [x] Local testing guide added to progress notes (Redis + simulator).

### 2. Pending / Next Steps

| Area          | Task                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| Backend       | Expose `X-Idempotency-Request-Id` header with shareId                               |
| Backend       | Emit metrics `idempotency.requests_total`, `idempotency.duplicates_prevented_total` |
| Observability | Dashboards & alerts (lock contention, duplicate rate)                               |
| Documentation | Update API docs & publish iOS integration guide                                     |
| Roll-out      | Deploy with flag OFF → 1 % iOS → full ramp                                          |
| Infra         | Confirm production Redis Lua support & 24 h TTL policy                              |

### 3. Implementation Progress Log

2025-06-14 → MVP code merged into dev branch, unit tests green, manual simulator test instructions verified.

_(Keep appending progress entries here.)_
