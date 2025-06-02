# ADR-011: Mobile and Extension API Integration Strategy

## Status
Accepted

## Context
We have successfully implemented individual components across multiple platforms (Tasks 1.4-1.10). Now we need to integrate these components into a cohesive system that provides consistent behavior, robust error handling, and seamless user experience across iOS, Android, and WebExtension platforms.

## Decision
We will implement a **unified TypeScript SDK** with platform-specific adapters, leveraging code generation from OpenAPI specifications to ensure type safety and consistency across all client applications.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client Applications                   │
├─────────────┬──────────────┬──────────────┬────────────┤
│   iOS App   │ Android App  │  RN Screens  │ Extension  │
│  (Swift)    │   (Kotlin)   │ (TypeScript) │    (TS)    │
├─────────────┴──────────────┴──────────────┴────────────┤
│                 Platform Adapters                        │
│  URLSession │    OkHttp    │ cross-fetch  │   fetch    │
├─────────────────────────────────────────────────────────┤
│              @bookmarkai/sdk (Generated)                 │
│            OpenAPI TypeScript Codegen                    │
├─────────────────────────────────────────────────────────┤
│                  Core Services                           │
│  Auth │ Shares │ Config │ Queue │ Health │ Events       │
└─────────────────────────────────────────────────────────┘
```

## Detailed Implementation

### 1. SDK Generation Strategy
- **Tool**: `openapi-typescript-codegen` from `apps/api/openapi.yaml`
- **Package**: Published as `@bookmarkai/sdk` to npm registry
- **Features**: 
  - Type-safe API methods
  - Pluggable network adapters
  - Built-in retry logic
  - Request/response interceptors

### 2. Network Abstraction
```typescript
interface NetworkAdapter {
  request<T>(config: RequestConfig): Promise<T>
}

// Platform implementations:
// - React Native + WebExtension: cross-fetch
// - iOS Share Extension: URLSession bridge
// - Android Share Intent: OkHttp bridge
```

### 3. Configuration Management
```typescript
// Build-time configuration
const config = {
  apiUrl: process.env.API_URL,
  environment: process.env.NODE_ENV
}

// Development hot-reload via Metro
// Polls /.well-known/dev-config.json for ngrok URL updates
if (__DEV__) {
  pollDevConfig(url => sdk.updateBaseUrl(url))
}
```

### 4. Authentication & Security

#### Token Management
- **Storage**:
  - iOS/Android: Keychain/Keystore via `react-native-keychain` with shared access groups
  - WebExtension: AES-GCM encrypted in `browser.storage.local`
- **Refresh Logic**: Singleflight mutex prevents concurrent refresh races
- **Rotation**: Monthly automatic token rotation handled by SDK

#### Certificate Pinning
- **Production**: Enabled with backup pin
- **Development**: Disabled for ngrok compatibility

### 5. Offline-First Architecture

#### Queue Management
- **ID Generation**: ULID for sortable, unique identifiers
- **Storage**:
  - iOS: SQLite in shared app group
  - Android: Room with SQLCipher
  - WebExtension: IndexedDB
- **Sync Strategy**: Server-wins unless local `updated_at` is newer

#### Batch Operations
- Automatic batching when >1 share in 2-second window
- Endpoint: `POST /shares/batch`

### 6. Error Handling
```typescript
interface ApiError {
  code: string      // e.g., "RATE_LIMITED"
  message: string   // User-friendly message
  details?: any     // Additional context
}

// All unhandled errors pipe to Sentry with:
// - User ID
// - Platform tag
// - Request context
```

### 7. Real-time Updates
- **Server-Sent Events**: `/events` endpoint for cache invalidation
- **Fallback**: 60-second TTL for offline clients
- **Implementation**: EventSource with automatic reconnection

### 8. Rate Limiting
- **Client-side**: Token bucket (10 requests/10 seconds)
- **Server-side**: Returns 429 with `Retry-After` header
- **SDK**: Automatic retry with exponential backoff

### 9. Health Monitoring
```typescript
interface HealthService {
  isApiHealthy(): Promise<boolean>  // Checks /healthz
  getCircuitState(): 'closed' | 'open' | 'half-open'
}

// Circuit breaker: Opens after 3 failures in 30 seconds
```

### 10. Version Management
- **Header**: `Accept-Version: 1.0`
- **Incompatibility**: 426 Upgrade Required → ForceUpdateError
- **Client Action**: Redirect to app store or trigger WebExtension update

### 11. Feature Flags
- **Provider**: GrowthBook
- **Context**: `{appVersion, platform, userId}`
- **SDK Integration**: Automatic flag evaluation

### 12. Observability Stack
- **Errors**: Sentry with platform segmentation
- **Analytics**: PostHog for user behavior KPIs
- **Tracing**: OpenTelemetry with `x-trace-id` propagation
- **Dashboards**: Grafana showing p95 latency per platform

## Testing Strategy

### Unit Tests
- SDK methods with MSW mocks
- Platform adapter implementations
- Queue logic and deduplication

### Integration Tests
- Shared MSW fixtures in `test/fixtures`
- Network failure scenarios
- Token refresh edge cases

### E2E Test Matrix
| Platform | Tool | Scenarios |
|----------|------|-----------|
| React Native | Detox | Full app flows |
| iOS Extension | XCTests | Share → Queue → Sync |
| Android | Instrumented | Intent → Save → View |
| WebExtension | Playwright | Click → Save → Badge |

### Cross-Platform Scenarios
1. Save on mobile → View on extension
2. Queue offline → Sync when online
3. iOS ↔ Android duplicate prevention
4. Concurrent saves from multiple devices

## Deployment Strategy

### Mobile Apps
- **JS Updates**: Expo OTA for non-native changes
- **Native Updates**: Phased rollout via stores
- **Rollback**: Version pinning in critical issues

### WebExtension
- **Updates**: Auto-update via Chrome/Firefox stores
- **Manifest**: Version checks on startup

## Implementation Timeline

### Week 1: Core SDK
- [ ] Set up OpenAPI codegen pipeline
- [ ] Implement core SDK with adapters
- [ ] Unit tests and documentation

### Week 2: Platform Integration
- [ ] iOS/Android native bridges
- [ ] React Native integration
- [ ] WebExtension adapter

### Week 3: Testing & Polish
- [ ] E2E test suite
- [ ] Performance optimization
- [ ] Monitoring integration

## Consequences

### Positive
- **Type Safety**: Generated SDK eliminates API contract drift
- **Consistency**: Single source of truth for API interactions
- **Offline Support**: Zero data loss with intelligent queueing
- **Security**: Certificate pinning and encrypted storage
- **Observability**: Full visibility into client behavior
- **Developer Experience**: Hot reload and comprehensive testing

### Negative
- **Build Complexity**: SDK regeneration adds build step
- **Initial Setup**: More complex than direct API calls
- **CI Duration**: ~8 minutes for full platform matrix

### Mitigations
- Automated SDK generation in CI/CD
- Comprehensive documentation and examples
- Parallel test execution to minimize CI time

## References
- OpenAPI Specification: `apps/api/openapi.yaml`
- ADR-002: JWT Authentication Strategy
- ADR-004: Shares Endpoint Design
- ADR-007: iOS Share Extension Architecture
- ADR-008: Android Share Intent Implementation
- ADR-009: WebExtension Architecture
- ADR-010: ngrok Local Testing Setup