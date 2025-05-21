# ADR 007: iOS Share Extension for BookmarkAI

    •	Status: Proposed
    •	Date: 2025-05-19
    •	Authors: @shokhzodjon-tuyokov, @bookmarkai-mobile
    •	Revised: 2025-05-19

⸻

## 1 — Context

Task 1.7 adds an iOS Share Extension so users can save links straight from other apps (Safari, Twitter, TikTok, etc.) without opening BookmarkAI. The extension must:
• Persist the shared payload (URL + optional title/notes/OG metadata).
• Operate when offline and sync later.
• Re-use the existing JWT auth, queueing if the token is missing/expired.
• Fit cleanly into the ADR-006 mobile shell architecture and stay shippable in ≤ 4 dev-days after shell completion.

⸻

## 2 — Decision

Concern Decision
Communication with main app App Groups container (group.com.bookmarkai.shared) for structured queue files (shared_queue.db) + CFNotificationCenterDarwin ping so the RN app can refresh when foregrounded.
Authentication Extension reads access + refresh tokens from the same Keychain item via Keychain Sharing entitlement; if tokens are missing or expired it writes the share to the queue and exits in < 3 s (Apple guideline).
Data flow 1) Extension captures URL → normalises + pulls OpenGraph metadata.2) If network + valid JWT ⇒ POST /shares immediately.3) Else enqueue row in shared_queue.db.4) Main app’s background task drains queue on next launch/background-fetch.
Entitlements com.apple.security.application-groups, keychain-access-groups, optional com.apple.developer.associated-domains (for Universal Links deep-view).
Implementation stack Pure Swift 5 UI using UIViewControllerRepresentable where needed; shared SwiftPM package BookmarkAISharedKit for models, API client, queue logic. No React Native in extension (JS runtime not available).
Shared models Common Codable structs (ShareItem, AuthTokens) defined once in BookmarkAISharedKit and imported by both the iOS target and RN (via Swift module + TypeScript typings generated with swift-typescript).
Library compatibility Minimise dependencies; only KeychainAccess, Alamofire (matched TLS-pinning config), and Down for markdown preview (optional).
Offline support SQLite queue file in App Group; row schema = (id, url, meta_json, created_at). Background-task merge honours original create time for deduping/idempotency.
UI scope Compact sheet with: favicon, title, editable tags, optional note, spinner + success/fail toast. Advanced editing lives in main app.
Error handling Hard-fail paths (missing URL) show UIAlertController with “Couldn’t grab link”. All other errors fall back to queue so user never loses data.
Performance budget Launch ≤ 300 ms, memory < 16 MB. Heavy metadata fetch (OpenGraph) runs only if on Wi-Fi or 5G and finishes < 2 s; else deferred.
Accessibility Dynamic Type, VoiceOver labels, high-contrast focus ring, 44 pt tap targets.
Testing Unit tests for queue + API client; XCUI test target for extension sheet; injection tests to verify Keychain access from extension context.
CI/CD Separate extension scheme in Fastlane lanes. On merge: increment build, run tests, upload to TestFlight with --skip_waiting_for_build_processing.
App Store compliance Extension follows HIG; no tracking; all network calls use ATS-compliant TLS + certificate pinning (matches ADR-006).
Fallback on token refresh failure If /auth/refresh fails ⇒ write share to queue + store needsTokenRefresh=true; main app refreshes tokens before draining queue.
Analytics Lightweight count event “share_extension_save” pushed via NSUserDefaults → flushed by main app (extension sandbox bans heavy SDKs like Firebase).
Future extensibility Same App Group + queue pattern will be reused for Android Intent Filter (Task 1.8) and possible macOS Share Extension.

Core User Flow 1. User taps Share ▶︎ BookmarkAI. 2. Sheet appears (< 300 ms) → shows URL title, tags field. 3. User taps Save.
• If online & token valid → immediate POST → green checkmark → dismiss.
• Else → “Saved to queue” banner → dismiss. 4. Main app foregrounds later → drains queue → shows toast “3 items added”.

⸻

## 3 — Options Considered

Option Pros Cons
A. App Groups + Keychain Sharing (Chosen) Robust, battle-tested, background safe, no custom URL routing. Requires native Swift; more setup.
B. Send URL via custom URL scheme to RN app Almost no native code. Fails if app not running; can’t work offline; violates 3-second rule.
C. Write to iCloud Key-Value store Automatic sync, less local plumbing. Slower, requires iCloud, unpredictable offline behaviour.

⸻

## 4 — Rationale

    •	Apple’s 3-second execution limit means the extension can’t spin up JSCore; native Swift is mandatory.
    •	App Groups let us share both Keychain items and a lightweight SQLite queue, giving identical offline semantics to the RN shell (ADR-006).
    •	Keeping UI minimal preserves the ultra-fast save flow—the “aha-moment” we’re after.
    •	Certificate-pinned Alamofire client reuses ADR-006’s TLS config, so we don’t fragment security posture.

⸻

## 5 — Consequences

    •	Work triggered
    •	Create BookmarkAISharedKit SwiftPM module (models, API, queue).
    •	Add extension target, entitlements, App Group id, Keychain group id.
    •	Build minimal SwiftUI/UIKit sheet; integrate OpenGraph fetcher.
    •	Implement queue drain in RN app (shareQueueSync.ts).
    •	Update CI lanes and TestFlight distribution.
    •	Write XCUI tests for happy-path and offline queueing.
    •	Future impact
    •	Android Intent Filter can mirror same queue schema (Room DB).
    •	macOS share target is trivial (same SharedKit).
    •	If we adopt Expo for web, queue logic remains unaffected.
    •	SharedKit unlocks potential Watch complication (“Save from wrist”).

⸻

6 — Code-Sharing Strategy
• Swift ↔ TypeScript: generate TS types from SharedKit’s Codable models via swift-typescript on every build.
• Queue schema: single source of truth in SharedKit/QueueSchema.swift; RN reads via react-native-mmkv wrapper.
• Auth refresh: identical refresh algorithm lives in both SharedKit (Swift) and authHooks.ts (RN) to keep behaviour symmetrical.

⸻

7 — Versioning / Migration
• Extension version aligned with main app build (CFBundleShortVersionString).
• Queue schema version stored in UserDefaults(group). Migration script auto-runs if schema ≠ expected.
• Minimum iOS version: 14 (Share Extension & App Groups stable, SFSymbols support).

⸻

8 — Links
• Apple Developer — Sharing and Actions
• Keychain Sharing — Technical Note Keychain Services
• App Groups — Entitlement Guide
• iOS App Extension Programming Guide — https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/
