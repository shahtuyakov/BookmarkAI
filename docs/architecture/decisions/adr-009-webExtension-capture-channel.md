# ADR-009: WebExtension Capture Channel for BookmarkAI

*Status*: **Proposed** – 2025-05-28  
*Deciders*: Web / Platform team  
*Supersedes / Influences*: ADR-007 (iOS Share Extension), ADR-008 (Android Share Intent)

---

## Context

Mobile users can save links via iOS Share Extension (ADR-007) and Android Share Intent (ADR-008).  
Desktop browsers, however, require copy-pasting URLs into the web app—an obvious friction point that limits adoption.

Market-norm for bookmarking tools (Pocket, Raindrop, Omnivore) is a one-click browser button.  
We therefore need a **WebExtension** that:

1. Works on Chromium, Firefox, and eventually Safari.
2. Re-uses existing JWT auth, queue schema, and `/v1/bookmark` endpoint.
3. Captures only lightweight metadata client-side; heavy scraping remains server-side.

---

## Decision

We will ship **BookmarkAI Web Clip**, a Manifest V3 extension with three moving parts:

| Component | Responsibility |
|-----------|----------------|
| **Content Script** | Inject 48 px cyan “★” FAB; scrape `location.href`, `<title>`, favicon, OG tags; message background. |
| **Service-worker Background** | Hold JWT, call `POST /v1/bookmark` with body `{ url, title, faviconUrl, meta, source:\"webext\" }`; retry on 5xx with exponential back-off; expose context-menu “Bookmark this page”. |
| **Popup UI** | React+Vite panel re-using Chakra theme; shows login state and last 10 saves via `/v1/bookmark?limit=10`. |

### Key Details

* **Manifest**: Version 3; permissions: `activeTab`, `storage`, and `<api-gateway-origin>/*` only.  
* **Auth Flow**: PKCE OAuth—opens `/oauth/authorize`; redirect lands on `chrome-extension://<id>/callback.html`; JWT stored in `chrome.storage.local` (encrypted at rest by the browser).  
* **Supported Sites**: Works everywhere; hostname forwarded so backend picks specialised parser for ~20 high-traffic platforms (YouTube, Medium, X/Twitter, Reddit, GitHub, etc.).  
* **UI/UX**:  
  * FAB idle → hover glow → spinner → checkmark → filled.  
  * Toast “Saved to BookmarkAI — View in Timeline” (links to web app).  
  * Draggable FAB; position saved in `chrome.storage.sync`.  
* **Build & CI**:  
  * `pnpm dev:webext` → Vite HMR in Chrome.  
  * GitHub Action `webext.yml`: `web-ext lint`, unit tests (Vitest), package ZIP artifact.  
  * Release path: Chrome Web Store & Edge Add-ons Day-1; Firefox AMO beta; Safari (Xcode converter) in Q3 2025.

---

## Consequences

### Positive
* Desktop capture friction drops to one click; expected ≥ 15 % lift in daily saved items.  
* Shares queue stays unified across iOS, Android, and Web (analytics & retries consistent).  
* MV3 future-proofs against Chrome deprecations; no background pages to drain memory.

### Negative / Trade-offs
* Firefox MV3 polyfill is still experimental—extra QA overhead.  
* Safari build/sign-off requires Apple Developer account + notarisation workflow.  
* Another auth surface: must watch for token-refresh bugs across three codebases.

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| CSP of some sites blocks injected script | FAB injected via `shadowDOM`; minimal inline styles; CSP error logging in background. |
| OAuth pop-up blockers break login | Offer fallback “Copy code” flow; detect blocked window and show instructions in popup. |
| Duplicate saves from rapid clicks | Disable FAB until backend 200 OK; idempotency key = SHA-1(url+day). |

---

## Open Questions

1. Add optional **page-scroll offset** to resume reading?  
2. Allow **user notes** in popup before saving?  
3. Granularity of telemetry (per-host success vs aggregate)?

---

## Follow-up Tasks

1. Scaffold extension repo: `packages/webext/` with Vite template and shared ESLint config.  
2. Implement PKCE OAuth callback page + unit tests.  
3. Add `source:"webext"` field to `/v1/bookmark` DTO; update OpenAPI spec + client.  
4. Build GitHub Action `webext.yml` (lint → tests → package).  
5. Draft Chrome Web Store listing (description, screenshots, 128 × 128 icon).  
6. Write automated Playwright smoke tests for top 10 hostnames.  
7. QA checklist for Firefox MV3 – flag polyfill issues.  
8. Prepare Safari converter workflow (Xcode 17 - `--background-scripts` entitlement).  

---

*Prepared 2025-05-28 by BookmarkAI core team.*  