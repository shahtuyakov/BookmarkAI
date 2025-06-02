# Task 1.11: Mobile & Extension API Integration - Implementation Checklist

## Overview
This checklist breaks down ADR-011 into actionable tasks for integrating all client platforms with the BookmarkAI API.

## Prerequisites Verification
- [ ] Confirm all dependencies (Tasks 1.4-1.10) are complete
- [ ] Verify ngrok setup is working for all developers
- [ ] Ensure all team members have access to required services (Sentry, PostHog, GrowthBook)

## Week 1: Core SDK Development

### Day 1: Setup & Generation Pipeline
- [ ] Create `packages/sdk` directory structure
- [ ] Set up OpenAPI spec file at `apps/api/openapi.yaml`
- [ ] Configure `openapi-typescript-codegen` build pipeline
- [ ] Create npm package configuration for `@bookmarkai/sdk`
- [ ] Set up CI/CD for automatic SDK generation on API changes

### Day 2: Core SDK Implementation
- [ ] Implement base SDK client with pluggable adapters
- [ ] Create `NetworkAdapter` interface
- [ ] Implement `cross-fetch` adapter for React Native/WebExtension
- [ ] Create auth service with singleflight mutex for token refresh
- [ ] Implement token storage interfaces

### Day 3: SDK Services & Features
- [ ] Implement shares service methods
- [ ] Add client-side token bucket rate limiter (10 req/10s)
- [ ] Create health check service with circuit breaker
- [ ] Implement batch operations support
- [ ] Add request/response interceptors for tracing

## Week 2: Platform Integration

### Day 4: React Native Integration
- [ ] Install SDK in React Native app
- [ ] Implement `react-native-keychain` token storage
- [ ] Create `SyncService` for queue processing
- [ ] Update all API calls to use SDK
- [ ] Implement dev config polling for ngrok URLs

### Day 5: iOS Native Integration
- [ ] Create Swift bridge for URLSession adapter
- [ ] Update share extension to use SDK via bridge
- [ ] Implement shared keychain access group
- [ ] Add certificate pinning for production
- [ ] Update queue to use ULID identifiers

### Day 6: Android Native Integration
- [ ] Create Kotlin bridge for OkHttp adapter
- [ ] Update share intent to use SDK via bridge
- [ ] Implement encrypted shared preferences access
- [ ] Add certificate pinning for production
- [ ] Update Room entities to use ULID identifiers

### Day 7: WebExtension Integration
- [ ] Install SDK in WebExtension
- [ ] Implement AES-GCM encryption for token storage
- [ ] Update service worker to use SDK
- [ ] Implement IndexedDB queue with ULID
- [ ] Add SSE support for cache invalidation

## Week 3: Testing & Polish

### Day 8: Testing Infrastructure
- [ ] Create shared MSW mock fixtures in `test/fixtures`
- [ ] Set up Detox for React Native E2E tests
- [ ] Configure XCTests for iOS share extension
- [ ] Set up instrumented tests for Android
- [ ] Configure Playwright for WebExtension testing

### Day 9: E2E Test Implementation
- [ ] Test: Save on mobile → view on extension
- [ ] Test: Queue offline → sync when online
- [ ] Test: Duplicate prevention across platforms
- [ ] Test: Token refresh race conditions
- [ ] Test: Force update flows

### Day 10: Monitoring & Observability
- [ ] Integrate Sentry error tracking in SDK
- [ ] Add PostHog analytics events
- [ ] Implement OpenTelemetry tracing
- [ ] Set up Grafana dashboards
- [ ] Configure alerting rules

### Day 11: Performance & Optimization
- [ ] Profile SDK bundle size
- [ ] Optimize network request batching
- [ ] Test and tune circuit breaker thresholds
- [ ] Verify sub-200ms response times
- [ ] Load test with concurrent platform usage

### Day 12: Documentation & Deployment
- [ ] Write SDK usage documentation
- [ ] Create platform integration guides
- [ ] Document configuration options
- [ ] Prepare deployment runbook
- [ ] Conduct team knowledge transfer

## Critical Path Items

### Must Complete First
1. SDK generation pipeline - blocks all other work
2. Network adapters - required for platform integration
3. Token management - security critical
4. ULID implementation - prevents duplicates

### Can Be Parallelized
- iOS and Android native bridges
- Testing infrastructure setup
- Monitoring integration
- Documentation

## Rollout Strategy

### Phase 1: Internal Testing
- [ ] Deploy to development environment
- [ ] Test with team devices
- [ ] Fix critical issues

### Phase 2: Beta Testing
- [ ] Deploy to staging environment
- [ ] Select beta testers
- [ ] Monitor error rates and performance

### Phase 3: Production Release
- [ ] Gradual rollout (10% → 50% → 100%)
- [ ] Monitor dashboards closely
- [ ] Have rollback plan ready

## Success Criteria
- [ ] All platforms can create shares via API
- [ ] Offline queue syncs successfully
- [ ] No duplicate shares created
- [ ] p95 latency < 200ms
- [ ] Zero data loss during offline periods
- [ ] Successful token refresh across platforms
- [ ] All E2E tests passing

## Risk Mitigation
- [ ] Backup plan for SDK generation failures
- [ ] Feature flags for gradual rollout
- [ ] Rollback procedures documented
- [ ] On-call rotation established

## Notes
- Keep OpenAPI spec as source of truth
- Test ngrok configuration thoroughly
- Monitor SDK bundle size impact
- Consider GraphQL for future iterations