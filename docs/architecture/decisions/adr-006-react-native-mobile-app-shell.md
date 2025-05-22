# ADR 006: React Native Mobile App Shell for BookmarkAI

- **Status**: Proposed
- **Date**: 2025-05-17
- **Authors**: @shokhzodjon-tuyokov, @bookmarkai-mobile
- **Revised**: 2025-05-18

---

## 1 — Context

Task 1.6 kicks off the client-side experience. The mobile shell must:

- Authenticate with the JWT service delivered in Task 1.2.
- Provide navigation scaffolding for future screens and share-sheet flows.
- Be extensible for iOS Share Extension and Android Intent Filter (Tasks 1.7 & 1.8).
- Deliver the basics in four dev-days without blocking later feature work.

## 2 — Decision

| Concern                    | Decision                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Project template**       | **Bare React Native 0.77 (TypeScript)** created via `npx react-native init bookmarkai --template react-native-template-typescript`.                                                                                                                                                                             |
| **Navigation**             | **React Navigation v6** with:<br>• `AuthStack` (Login → Register → ForgotPassword)<br>• `MainTab` (Home \| Search \| Profile)<br>• nested `Stack` for detail screens.                                                                                                                                           |
| **State / data**           | React Context + custom hooks for auth/session;<br>`react-query` for API calls + caching.                                                                                                                                                                                                                        |
| **Offline support**        | Implement persistence layer with `react-query persistQueryClient`<br>• Cache viewed content for offline access<br>• Queue share actions performed offline<br>• Sync when connection restored with background retry.                                                                                             |
| **Secure storage**         | `react-native-keychain` (iOS Keychain / Android Keystore) to store access & refresh tokens.                                                                                                                                                                                                                     |
| **Biometric auth**         | Implement optional Face ID/Touch ID with `react-native-biometrics`<br>• Allow biometric unlock instead of re-entering credentials<br>• Use for confirming sensitive actions.                                                                                                                                    |
| **API security**           | Implement certificate pinning with `TrustKit` integration<br>• Prevent MITM attacks.                                                                                                                                                                                                                            |
| **Token refresh**          | Axios instance with interceptor:<br>• adds `Authorization: Bearer <token>`<br>• on 401, calls `/auth/refresh`, retries once.                                                                                                                                                                                    |
| **UI library**             | **React Native Paper** (MD3) with theme tokens under `src/theme`.                                                                                                                                                                                                                                               |
| **UX patterns**            | Standardize interaction patterns:<br>• Loading states (skeleton loaders for content)<br>• Error handling (toast notifications + retry actions)<br>• Pull-to-refresh for content lists<br>• Haptic feedback for important actions<br>• Animation standards (shared element transitions for details).             |
| **Appearance**             | Support dark/light mode with theme switching<br>• Detect and respect system appearance settings.                                                                                                                                                                                                                |
| **Folder layout**          | `src/` → `screens/`, `components/`, `navigation/`, `hooks/`, `services/`, `types/`.                                                                                                                                                                                                                             |
| **Deep linking**           | Prefix `bookmarkai://` for in-app routes; ready for share extensions (`bookmarkai://share?url=...`).                                                                                                                                                                                                            |
| **Analytics & monitoring** | Implement `react-native-performance` for key metrics<br>• Track TTI (Time to Interactive) for key screens<br>• Monitor JS thread frame drops<br>• Set up crash reporting with Crashlytics<br>• Define custom user journey events.                                                                               |
| **Accessibility**          | Meet WCAG 2.1 AA standards:<br>• Proper semantic markup with `accessibilityLabel` and `accessibilityHint`<br>• Minimum touch target size (44×44pt)<br>• Support dynamic text sizes<br>• Screen reader optimization<br>• Color contrast compliance.                                                              |
| **Testing**                | Jest + React Native Testing Library for unit tests<br>• Snapshot tests for UI components<br>• Integration tests for critical user flows<br>• Mock service worker for API testing<br>• Visual regression tests with Chromatic<br>• Set minimum 80% code coverage target<br>• Detox e2e harness added in Phase 2. |
| **Performance baseline**   | Enable Hermes, Proguard/R8 minification; lazy-load tabs; FastImage for remote thumbnails.                                                                                                                                                                                                                       |
| **CI/CD strategy**         | Define complete pipeline:<br>• Automated PR checks (lint, test, type-check)<br>• Build versioning strategy<br>• TestFlight/Play Store internal track distribution<br>• Automated screenshot generation<br>• Release notes automation.                                                                           |
| **Error handling**         | Implement global error boundaries for graceful recovery<br>• Centralized error tracking and reporting.                                                                                                                                                                                                          |
| **Feature flags**          | Implement feature flag system using `react-native-config`<br>• Support A/B testing and controlled rollouts.                                                                                                                                                                                                     |

### Core screens included in MVP

1. **Login** / **Register** / **ForgotPassword**
2. **Home** (infinite scroll of user's shares)
3. **Search** (placeholder)
4. **Profile / Settings**
5. **Detail** (opens when tapping a share)

## 3 — Options Considered

| Option                       | Pros                                                                       | Cons                                                            |
| ---------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **A. Bare RN (Chosen)**      | Full native control; extensions require native modules; no future "eject". | Slightly more DevOps work than Expo.                            |
| **B. Expo managed workflow** | Fast onboarding, OTA updates.                                              | Share extensions force eject; binary size overhead.             |
| **C. Flutter**               | Single codebase incl. web.                                                 | New stack; no existing hires; share extension plugins immature. |

## 4 — Rationale

- Bare RN avoids the inevitable Expo → bare migration once share extensions arrive.
- React Navigation + RN Paper are mainstream and well-documented, reducing ramp-up.
- Keeping global state minimal (Context + hooks) delays Redux/Zustand decision until complexity demands it.
- Secure Keychain storage aligns with OWASP MAS-VS requirements and ADR 0002's token spec.
- Biometric authentication enhances security while improving user experience.
- Offline support is critical for mobile users with intermittent connectivity.
- Accessibility considerations ensure the app is usable by all and meets app store requirements.

## 5 — Consequences

- **Work triggered**

  - Scaffold project and CI job (`yarn build:ios`, `build:android`).
  - Implement auth flows and interceptor.
  - Integrate deep linking + test manual `bookmarkai://share` open.
  - Set up biometric authentication and offline persistence.
  - Implement accessibility standards and testing infrastructure.
  - Configure analytics and performance monitoring.

- **Future impact**
  - Share extensions will reuse Keychain access + deep-link handler.
  - If we add web, Next.js can share API hooks built on react-query.
  - Performance metrics will guide optimization efforts in later phases.
  - Feature flag system enables gradual rollout of new capabilities.
  - Accessibility focus ensures broad usability from the start.

## 6 — Code Sharing Strategy

To maximize code reuse between mobile and web (Phase 4):

- **TypeScript interfaces** for API responses, domain models in `shared` package
- **API hooks** in platform-agnostic format that can be used by React and React Native
- **Business logic** separated from UI components in pure JS/TS utilities
- **Theme tokens** standardized across platforms with platform-specific implementations

## 7 — Versioning Strategy

- Semantic versioning (MAJOR.MINOR.PATCH)
- API version tolerance specified in app requests
- Runtime API compatibility checks to prompt updates when needed
- Minimum OS version requirements: iOS 15.1+, Android 8+ (API 26)

## 8 — Links

- ADR 0002 — JWT Auth & KMS signing
- React Navigation docs — <https://reactnavigation.org/>
- RN Keychain docs — <https://github.com/oblador/react-native-keychain>
- OWASP Mobile App Security — <https://owasp.org/www-project-mobile-security-testing-guide/>
- WCAG 2.1 Mobile — <https://www.w3.org/WAI/standards-guidelines/wcag/new-in-21/>
