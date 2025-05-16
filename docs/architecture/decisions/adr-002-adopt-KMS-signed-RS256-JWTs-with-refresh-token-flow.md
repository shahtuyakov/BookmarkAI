# ADR 002: Adopt KMS-signed RS256 JWTs with Refresh-Token Flow for BookmarkAI
* **Status**: Accepted  
* **Date**: 2025-05-17  
* **Authors**: @shokhzodjon-tuyokov, @bookmarkai-core  
* **Supersedes**: —  
* **Superseded by**: —  
---
## 1 — Context
BookmarkAI's MVP needs stateless authentication for the NestJS + Fastify API that:
* Works for **mobile apps, browser extensions, and the future web app**.  
* Can be validated quickly by any API node without shared session state.  
* Keeps private signing material out of the Git repo and out of the runtime filesystem.  
* Supports logout / compromise revocation until we build a full session store.  
* Plays nicely with AWS infrastructure we plan to deploy in Phase 5.
## 2 — Decision
We will implement **JWT-based auth with the following shape**:
| Element | Choice |
|---------|--------|
| **Signing** | `RS256` (asymmetric) keys managed by **AWS KMS**. |
| **Access token** | Lifetime 15 min, signed by KMS key `bookmarkai-auth-01`. |
| **Refresh token** | Lifetime 7 days, signed by same key; its SHA-256 hash is stored in `users.refresh_hash` for rotation & revocation. |
| **Claims** | `sub`, `email`, `role`, `iat`, `exp`, `jti`, `iss:"bookmarkai"` |
| **Password hashing** | `Argon2id` (4 MB mem, 3 iters, 32-byte salt). |
| **Token revocation** | Redis set keyed by `jti`; entries expire at token's `exp`. |
| **Client storage** | Mobile/extension: `Bearer` header. Web (future): `Secure`/`HttpOnly` cookie + SameSite Lax. |
| **Local dev fallback** | When `TOKEN_KEY_ID=local`, use an RSA 2048 pair in `dev/keys` and Node `crypto.sign/verify`. |
| **Rate limiting** | Auth endpoints limited to 10 attempts per IP per minute; user-specific rate limits after 3 failed attempts. |
| **KMS contingency** | On KMS failure, fall back to cached public key for verification; queue token issuance requests with exponential backoff; alert DevOps. |

**Refresh Token Rotation** will handle these edge cases:
* **Concurrent refreshes**: Track token family via `refresh_family_id`; invalidate all previous tokens when any is used.
* **Network interruptions**: Allow a one-time grace period where the previous token works if client didn't receive the new pair.
* **Revocation cascade**: When a token is compromised, revoke its entire family tree.

The NestJS **AuthModule** will expose:
* `POST /auth/register` → create account, return token pair  
* `POST /auth/login` → verify password, return token pair  
* `POST /auth/refresh` → swap refresh→new pair, rotate `jti`  
* `POST /auth/logout` → add `jti` to blacklist, clear cookie (web)  
Guards: `JwtAuthGuard` (access-token) and `RolesGuard` (RBAC).
## 3 — Options Considered
| Option | Pros | Cons |
|--------|------|------|
| **A. RS256 + KMS (chosen)** | Key never leaves KMS; easy rotation; verifier can be public across services. | Extra latency on `Sign`; dev key fallback needed. |
| **B. HS256 with shared secret in AWS Secrets Manager** | Simpler libs; faster signing. | Secret must be copied to every container → larger blast radius. |
| **C. AWS Cognito Hosted UI** | Turns auth into config; social login built-in. | Vendor lock-in; poor DX for extensions; more upfront setup. |
| **D. Session cookies stored in Redis** | Revocation is trivial. | Sticky state contradicts k8s/ECS stateless scaling; harder to share across mobile & extension. |
## 4 — Rationale
* **Least-privilege key handling**: the private key never sits on disk or in env vars.  
* **Cross-client flexibility**: JWT works equally for React Native, WebExtension, and future web.  
* **Industry standard**: RS256 + refresh rotation is a well-trodden path, easy to audit.  
* **Smooth migration**: can evolve into OAuth 2.0 or split into micro-service auth issuer later without invalidating tokens.
## 5 — Consequences
* **Work triggered**:  
  * Implement `KmsJwtService` wrapper (Task 1.2-A).  
  * Provision KMS key via CDK with 90-day rotation (Task 0.3 update).  
  * Add Redis to Docker Compose for blacklist (Task 0.2 update).  
  * Update mobile & extension specs to store/refresh tokens.
  * Implement rate limiting for auth endpoints using Redis (Task 1.2-B).
  * Set up auth failure monitoring with alert thresholds (Task 1.2-C).
* **Future impact**:  
  * If we move to multi-tenant or add SSO, we can issue new `iss` values without breaking validation.  
  * Access-token lifetime tuning becomes a security/perf dial.
* **Monitoring plan**:
  * Track failed login attempts with Prometheus counters.
  * Set up alerts for unusual patterns (multiple failed attempts across accounts, geographic anomalies).
  * Create dashboard to visualize auth activity trends.
  * Log key auth events for security audit trail.
## 6 — Links
* PoC commit ➜ `8c2b1d1` — Node script signing/verifying via KMS  
* ADR 0001 ➜ Modular-Monolith baseline structure  
* OWASP recommendations ➜ <https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet_for_Java.html>