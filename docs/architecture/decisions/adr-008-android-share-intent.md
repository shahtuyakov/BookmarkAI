# ADR-008: Android Share Intent Architecture for BookmarkAI

*Status*: **Accepted** – 2025-05-25  
*Deciders*: Mobile team  
*Supersedes / Influences*: ADR-006 (RN shell), ADR-007 (iOS Share Extension)  

---

## Context

Task 1.7 delivered an iOS Share Extension that lets users save URLs from Safari / other apps into BookmarkAI.  
Task 1.8 must provide **feature-parity on Android** while respecting platform constraints introduced in Android 7–15 
(Doze, background-start limits, battery optimisations).

Competing approaches considered:

1. **Foreground Service** – runs silently, needs persistent notification on API 34+.  
2. **Transparent Activity → immediate processing** – simple but violates 500 ms limit if network is slow.  
3. **Transparent Activity → WorkManager job** – Activity finishes fast; WorkManager handles retries.

---

## Decision

We will implement **Approach 3**:
User taps “Share › BookmarkAI”  ─►  ShareActivity (noHistory, finish < 150 ms)
─►  Encrypted Room queue (same schema as iOS)
─►  WorkManager ShareUploadWorker
─►  Server POST /shares  (exp back-off)
─►  RN bridge flushQueue() on AppState.active

* **ShareActivity**  
  * Transparent theme (`@style/Theme.Transparent`), `android:exported="true"`, `android:autoVerify="false"`.
  * Handles the `SEND` action for MIME types `text/plain` and `text/uri-list`.
  * Full intent‑filter:
    ```xml
    <activity
        android:name=".ShareActivity"
        android:exported="true"
        android:theme="@style/Theme.Transparent">
        <intent-filter android:autoVerify="false">
            <action android:name="android.intent.action.SEND"/>
            <category android:name="android.intent.category.DEFAULT"/>
            <data android:mimeType="text/plain"/>
        </intent-filter>
    </activity>
    ```
  * Parses `EXTRA_TEXT`, validates supported platforms (TikTok, Reddit, Twitter, X).  
  * Inserts row into `BookmarkQueue` Room table with UUID, timestamp, status *PENDING*.  
  * Finishes immediately (ANR-safe).

* **WorkManager layer**  
  * Constraint: `NetworkType.CONNECTED`.  
  * **Adaptive batching**: sequential uploads when the queue has ≤ 5 items; up to **3 parallel coroutines** with jittered delay when > 5.  
  * Retries with exponential back-off (max 6 h); sets row status to *UPLOADED* or *FAILED*.  
  * No foreground-service notification required.

* **Storage**  
  * `Room` + `SQLCipher` (via `net.zetetic:android-database-sqlcipher`) for encryption at rest.  
  * Schema mirrors iOS queue (id, url, createdAt, status).

* **Security**
  * SQLCipher provides 256‑bit AES; the database key is derived from a Jetpack Security `EncryptedSharedPreferences` master key.

* **RN Bridge**  
  * Kotlin `ShareHandlerModule` – exposes `flushQueue()` and `getPendingCount()`.  
  * JS side reuses `ShareExtensionHandler.ts` (no platform forks).

* **UX**  
  * Always show a **1-second Toast** (“Saved to BookmarkAI”) from `ShareActivity`, regardless of whether the main app is foreground.  
  * **No auto-launch** of the main app; deeper interaction happens only after the user opens BookmarkAI.  
  * When the main app is open, badge the **Inbox** icon with the count of failed shares (via `getPendingCount()`).

  ### Authentication Handling
* WorkManager reads tokens from EncryptedSharedPreferences
* On 401 errors: mark share as NEEDS_AUTH, let main app refresh tokens
* Main app processes NEEDS_AUTH items after successful token refresh

### Success Metrics
* **URL share success rate** ≥ 99 % within 10 minutes (P95).  
* **Toast latency** < 150 ms at P99.  
* Crash-free rate ≥ 99.9 % for `ShareActivity` and `ShareUploadWorker`.

### Error Classification
* **Permanent failures**: Unsupported platform, malformed URL → delete from queue
* **Auth failures**: Expired tokens → mark NEEDS_AUTH, retry after refresh
* **Temporary failures**: Network, server errors → exponential backoff retry
* **Rate limit**: 429 responses → back off with jitter


### Queue Limits & Cleanup
* Maximum 100 pending items (protect against abuse)
* Cleanup completed items after 7 days
* Failed items kept for 30 days with manual retry option

---

## Consequences

### Positive
* **Parity with iOS** – identical queue schema & JS logic.  
* **Survives Doze / OEM battery killers** – WorkManager backed by `JobScheduler`.  
* **ANR-safe** – Activity finishes well under 500 ms.  
* **No ugly persistent notification** – avoids Service restrictions on API 34+.  
* **Encrypted** – meets Play Data Safety and GDPR.

### Negative / Trade-offs
* Additional Room + SQLCipher dependencies (~500 KB APK increase).  
* Delay between share tap and server sync (depends on WorkManager constraints).  
* More moving parts than a pure Activity-only flow (but acceptable).

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| OEM kills WorkManager on aggressive ROMs | Exponential back‑off + flushQueue() on App launch + manual `pull‑to‑sync` |
| DB migration issues | Versioned Room schema, test migrations in CI |
| Play Integrity / namespace errors with new module | Gradle 8.* `namespace` fields added in all modules |


---

## Follow-up Tasks

1. Implement `BookmarkQueue` Room DAO + migration tests.  
2. Create `ShareUploadWorker` with back-off and unit tests via `WorkManagerTestInitHelper`.  
3. Add `flushQueue()` call in `App.tsx` `AppState.active` handler.  
4. Write Espresso intent test for `ShareActivity`.  
5. Update CI to run DB migration + WorkManager tests.  
6. Add ProGuard/R8 keep rules for SQLCipher (`-keep class net.sqlcipher.** { *; }`).  
7. Run Play Integrity tests on a device/emulator running Android 15 (API 35) preview.

---