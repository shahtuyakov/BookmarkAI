# ADR 004: Design of the **/shares** Endpoint for BookmarkAI MVP

* **Status**: Proposed  
* **Date**: 2025-05-17  
* **Authors**: @shokhzodjon-tuyokov, @bookmarkai-core  
* **Supersedes**: —  
* **Superseded by**: —  

---

## 1 — Context  
Task 1.4 delivers the first outward-facing feature of BookmarkAI: capturing links (-“shares”) that users save from mobile share sheets and the browser extension. The endpoint must:  

* Accept *any* supported social-media URL quickly, without blocking on downstream scraping/ML jobs (Task 1.5+).  
* Respect idempotency because mobile share sheets often double-fire.  
* Guarantee users only see their own data (multi-tenant).  
* Provide a stable contract for three clients (iOS extension, Android intent, React Native app).  

## 2 — Decision  

| Concern | Decision |
|---------|----------|
| **Routes** | `POST /v1/shares` (create) — returns 202 Accepted with the share record.<br>`GET /v1/shares` (list) — paginated, user-scoped.<br>`GET /v1/shares/:id` (detail) — optional for Phase 1.<br>`DELETE /v1/shares/:id` deferred to Phase 7. |
| **Auth** | Protected by `JwtAuthGuard`; user extracted via `@CurrentUser()`. |
| **Idempotency** | Client sends `Idempotency-Key` header (RFC -ish).<br>Server stores `{user_id, key}` in **Redis** with 24 h TTL; duplicate key → 200 re-play with existing share JSON. |
| **Request body** | `{ url: string }` only. Server infers platform (`platform` enum) via regex. |
| **Validation** | 1) URL scheme = `https`; 2) host matches allowed list (tiktok.com, reddit.com, x.com, twitter.com); 3) length ≤ 2 kB. |
| **DB schema** | Table **shares**<br>`id uuid PK` | `user_id uuid FK` | `url text` | `platform text` | `status text` (pending, processing, done, error) | `created_at timestamptz` | `updated_at timestamptz`.<br>**Unique index** on `(user_id, url)`. |
| **Worker integration** | After insert, publish job `share.process` to **BullMQ**; worker updates status column. |
| **Response shape** | Success: `{ success:true, data:{ id, url, platform, status } }`.<br>Error: `{ success:false, error:{ code, message } }` per API style guide. |
| **Pagination** | Cursor-based (`?cursor=`) with `limit` default = 20, max = 100. |
| **Rate limit** | `fastify-rate-limit` → 10 POSTs / 10 s per user. |
| **OpenAPI** | Documented via Swagger decorators; clients can generate TypeScript types. |

## 3 — Options Considered  

| Option | Pros | Cons |
|--------|------|------|
| **A. Single POST & polling (chosen)** | Small surface; decouples heavy work; fits mobile offline pattern. | Requires second call to view enriched data. |
| **B. Synchronous scrape in POST** | Client instantly gets metadata. | Unpredictable latency; fails under rate limits; harder to scale. |
| **C. GraphQL mutations** | Fits future web nicely. | Extra infra for RN/extension now; learning curve. |
| **D. Simple GET + querystring (“bookmarklet” style)** | No request body; easy manual testing. | Doesn’t support idempotency header cleanly; bad for mobile share sheet. |

## 4 — Rationale  
* **Asynchronous design** keeps P99 latency < 200 ms and allows heavy fetch/ML to scale separately.  
* **Header-based idempotency** is language-agnostic and doesn’t pollute body schema.  
* **Per-user URL uniqueness** avoids accidental duplicates while letting two users save the same link.  
* **Cursor pagination** survives deletes and is friendlier to infinite scroll than offset.  

## 5 — Consequences  

* **Work triggered**  
  * Create `shares.module`, controller, service, DTOs.  
  * Add Redis idempotency service (later reused for Task 1.14 extended logic).  
  * Write integration tests for duplicate POST and worker enqueue.  
  * Update Task 1.5 worker to transition status → `processing`.  
* **Future impact**  
  * Adding filters (`?platform=tiktok`) is straightforward — index on `(user_id, platform)`.  
  * When public feeds launch, we can relax the ownership filter and add RBAC without rewriting the endpoint.  

## 6 — Links  

* Prototype commit ➜  
* ADR 0002 ➜ JWT Auth & KMS signing.  
* Stripe idempotency best-practice reference ➜ external doc.