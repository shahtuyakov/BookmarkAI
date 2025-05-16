# ADR 0001: Adopt a Modular‑Monolith Architecture for BookmarkAI MVP

- **Status**: Accepted
- **Date**: 2025‑05‑16
- **Authors**: @shokhzodjon‑tuyokov, @bookmarkai‑core

---

## 1 — Context

BookmarkAI needs a backend foundation for its MVP (Tasks 1.x in the Task Map). The team must choose **how to structure the API service(s)** while balancing:

- Rapid feature delivery for a 12‑week roadmap
- Small engineering team (≤5 devs) and limited DevOps bandwidth
- Early‑stage uncertainty about feature set and product–market fit
- Desire to **easily carve out microservices later** (e.g. ML pipeline, payments)
- Infrastructure already provisioned for a single ECS service (Task 0.3)

## 2 — Decision

We will implement the MVP backend as a **Modular Monolith** built with **NestJS + Fastify** in a single repository/workload. Each bounded context (e.g. `auth`, `shares`, `metadata`) lives in its own Nest module and follows Domain‑Driven‑Design (DDD) principles. Cross‑cutting concerns (logging, config, error handling) reside in a `common` module.

## 3 — Options Considered

| Option                            | Pros                                                                                                                                    | Cons                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A — Modular Monolith (chosen)** | • Fastest dev loop (single process, no network hops) <br/>• Minimal infra/CI complexity <br/>• Clear future split path via Nest modules | • All modules share one deploy; a bad release can impact entire API <br/>• Need discipline to keep boundaries clean                                                      |
| **B — Microservices from day 1**  | • Independent scaling & deploys <br/>• Fault isolation per service                                                                      | • Significant infra overhead (multi‑repo, CI/CD, observability) <br/>• Higher cognitive load for small team <br/>• Harder local dev (multiple services, message brokers) |
| **C — Classic Layered Monolith**  | • Simplest structure, very low ceremony                                                                                                 | • Tight coupling between layers <br/>• Hard to extract services later <br/>• Mixing of domain concepts across layers                                                     |

## 4 — Rationale

Option A offers the best **speed‑to‑value** while imposing just enough structure to enforce domain boundaries. NestJS modules map naturally to bounded contexts, and Fastify delivers the desired performance with minimal code changes. The monolithic deploy matches our current AWS CDK stack and simplifies secrets management via Vault (Task 0.9).

## 5 — Consequences

- **Immediate Work**

  - Implement module skeletons (`auth`, `shares`, `health`, `common`, `config`) — see Task 1.1 checklist.
  - Enforce boundary rules via ESLint import‑path plugin.
  - Add ADR reference in project README.

- **Positive**

  - Single CI pipeline, single container to monitor.
  - Local dev is `pnpm dev` + `docker‑compose up`.

- **Negative / Risks**

  - Runtime failures can cascade; mitigate with thorough tests and feature flags.
  - Growing team must resist “reach across” module boundaries.

- **Revisit Trigger**

  - > 5 K rps sustained traffic **or** independent release cadence required for a module.
  - At that point, extract module into its own Nest app behind an internal API or event stream.

## 6 — Links

- Proof‑of‑concept commit ➜
- Task Map Phases ➜ `TASK_MAP.md` (Phase 0 & 1)
- ADR 002 (pending) — Logging & Observability Stack
