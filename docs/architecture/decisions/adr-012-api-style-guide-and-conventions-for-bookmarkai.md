# ADR-012: API Style Guide and Conventions for BookmarkAI

- **Status**: Proposed
- **Date**: 2025-06-09
- **Authors**: @bookmarkai-backend
- **Supersedes**: —
- **Superseded by**: —
- **Related**: ADR-004 (Shares Endpoint), ADR-001 (Modular Monolith)

---

## 1 — Context

Task 1.12 requires establishing comprehensive API conventions before expanding beyond the initial `/shares` endpoint. With multiple client platforms (iOS, Android, WebExtension, React Native) and future GraphQL/tRPC migration planned, we need consistent patterns that:

- Provide predictable interfaces for client developers
- Support offline-first mobile applications
- Enable efficient pagination for infinite scroll UIs
- Handle errors gracefully across platforms
- Scale to Phase 4's vector search and beyond
- Maintain backward compatibility as we evolve

Current implementation shows good patterns (cursor pagination, idempotency) but lacks formal documentation and comprehensive error taxonomy.

---

## 2 — Decision

### 2.1 Core Conventions

| Aspect             | Convention                                   | Example                                 |
| ------------------ | -------------------------------------------- | --------------------------------------- |
| **URL Structure**  | `/v{version}/{resources}/{id?}/{action?}`    | `/v1/shares`, `/v1/shares/123/metadata` |
| **HTTP Methods**   | REST semantics with 202 for async operations | `POST /v1/shares` → 202 Accepted        |
| **Resource Names** | Plural nouns, kebab-case                     | `shares`, `user-preferences`            |
| **Field Names**    | camelCase in JSON                            | `createdAt`, `shareId`, `faviconUrl`    |
| **Timestamps**     | ISO 8601 with timezone                       | `2025-06-09T14:30:00.000Z`              |
| **IDs**            | UUID v4                                      | `123e4567-e89b-12d3-a456-426614174000`  |

### 2.2 Request/Response Envelope

```typescript
// Success Response
{
  "success": true,
  "data": T,                    // Generic type for resource
  "meta"?: {                    // Optional metadata
    "requestId": string,        // Trace ID for debugging
    "version": string,          // API version
    "deprecation"?: string      // Deprecation notice
  }
}

// Error Response
{
  "success": false,
  "error": {
    "code": string,             // SCREAMING_SNAKE_CASE
    "message": string,          // Human-readable
    "details"?: {               // Additional context
      "field"?: string,         // For validation errors
      "constraint"?: string,    // What rule was violated
      "suggestion"?: string     // How to fix it
    },
    "timestamp": string,        // When error occurred
    "traceId": string          // For support/debugging
  }
}
```

### 2.3 Pagination Standards

```typescript
// Cursor-based (default for feeds/timelines)
GET /v1/shares?limit=20&cursor=2025-06-09T12:00:00.000Z_123-abc

Response:
{
  "success": true,
  "data": {
    "items": [...],
    "cursor": "2025-06-09T11:00:00.000Z_456-def",  // Next page cursor
    "hasMore": true,
    "limit": 20,
    "total"?: number  // Only if efficiently countable
  }
}

// Offset-based (only for admin/search with explicit counts)
GET /v1/admin/users?offset=40&limit=20

Response:
{
  "success": true,
  "data": {
    "items": [...],
    "offset": 40,
    "limit": 20,
    "total": 156
  }
}
```

### 2.4 Error Code Taxonomy

| Category             | Code Pattern   | Examples                                         |
| -------------------- | -------------- | ------------------------------------------------ |
| **Validation**       | `INVALID_*`    | `INVALID_URL`, `INVALID_EMAIL_FORMAT`            |
| **Authentication**   | `AUTH_*`       | `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS` |
| **Authorization**    | `FORBIDDEN_*`  | `FORBIDDEN_RESOURCE_ACCESS`                      |
| **Not Found**        | `NOT_FOUND_*`  | `NOT_FOUND_SHARE`, `NOT_FOUND_USER`              |
| **Conflict**         | `CONFLICT_*`   | `CONFLICT_DUPLICATE_EMAIL`                       |
| **Rate Limiting**    | `RATE_LIMIT_*` | `RATE_LIMIT_EXCEEDED`                            |
| **External Service** | `EXTERNAL_*`   | `EXTERNAL_TIKTOK_UNAVAILABLE`                    |
| **Server Error**     | `SERVER_*`     | `SERVER_DATABASE_ERROR`                          |

### 2.5 Filtering and Sorting

```typescript
// Filtering (comma-separated values for OR, multiple params for AND)
GET /v1/shares?platform=tiktok,reddit&status=done

// Sorting (comma-separated fields with - prefix for DESC)
GET /v1/shares?sort=-createdAt,platform

// Field selection (partial responses)
GET /v1/shares?fields=id,url,platform,createdAt

// Date range filtering
GET /v1/shares?createdAfter=2025-06-01&createdBefore=2025-06-09
```

### 2.6 Bulk Operations

```typescript
// Batch creation
POST /v1/shares/batch
{
  "operations": [
    { "url": "https://...", "idempotencyKey": "..." },
    { "url": "https://...", "idempotencyKey": "..." }
  ]
}

Response:
{
  "success": true,
  "data": {
    "succeeded": [...],
    "failed": [
      { "index": 1, "error": { "code": "...", "message": "..." } }
    ]
  }
}
```

### 2.7 Async Operations

```typescript
// Initiate async operation
POST /v1/imports/bulk
Response: 202 Accepted
{
  "success": true,
  "data": {
    "operationId": "op_123",
    "status": "pending",
    "statusUrl": "/v1/operations/op_123"
  }
}

// Check status
GET /v1/operations/op_123
{
  "success": true,
  "data": {
    "id": "op_123",
    "status": "processing", // pending|processing|completed|failed
    "progress": { "current": 45, "total": 100 },
    "result"?: { ... },     // When completed
    "error"?: { ... }       // When failed
  }
}
```

### 2.8 Headers and Cross-Cutting Concerns

| Header               | Purpose                      | Example                                        |
| -------------------- | ---------------------------- | ---------------------------------------------- |
| **Request Headers**  |                              |                                                |
| `Idempotency-Key`    | Prevent duplicate operations | UUID or client-generated key                   |
| `Accept-Version`     | Client version compatibility | `1.0`                                          |
| `X-Request-ID`       | Client-side tracing          | UUID for correlation                           |
| **Response Headers** |                              |                                                |
| `X-Rate-Limit-*`     | Rate limit info              | `Limit: 100, Remaining: 45, Reset: 1623456789` |
| `X-Request-ID`       | Request correlation          | Echoed from request or generated               |
| `Deprecation`        | API deprecation notice       | `Sun, 01 Jan 2026 00:00:00 GMT`                |
| `Sunset`             | API shutdown date            | `Sun, 01 Jul 2026 00:00:00 GMT`                |

### 2.9 Special Endpoints

```typescript
// Health check (no auth required)
GET /v1/health
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-06-09T14:30:00.000Z"
}

// Feature flags
GET /v1/features
{
  "success": true,
  "data": {
    "enableBulkImport": true,
    "maxUploadSize": 52428800
  }
}
```

### 2.10 WebSocket/SSE Events

```typescript
// Server-Sent Events for real-time updates
GET /v1/events
Accept: text/event-stream

// Event format
event: share.processed
data: {"shareId": "123", "status": "done"}

// Event naming: {resource}.{action}
// Examples: share.created, share.processed, user.upgraded
```

---

## 3 — Options Considered

| Aspect            | Option A       | Option B                  | Decision                          |
| ----------------- | -------------- | ------------------------- | --------------------------------- |
| **Error Format**  | Flat structure | Nested with details       | ✅ Nested (more extensible)       |
| **Pagination**    | Cursor only    | Both cursor & offset      | ✅ Both (different use cases)     |
| **Field Names**   | snake_case     | camelCase                 | ✅ camelCase (JS native)          |
| **Bulk Response** | All-or-nothing | Partial success           | ✅ Partial (better UX)            |
| **API Version**   | Path (`/v1/`)  | Header (`API-Version: 1`) | ✅ Path (clearer, cache-friendly) |

---

## 4 — Implementation Strategy

### 4.1 Enforcement Mechanisms

```typescript
// 1. NestJS Decorators
@ApiResponse({ type: StandardResponseDto })
@ApiPaginatedResponse(ShareDto)
// 2. Global Interceptor
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context, next): Observable<any> {
    return next.handle().pipe(
      map(data => ({
        success: true,
        data,
        meta: { requestId: context.switchToHttp().getRequest().id },
      })),
    );
  }
}

// 3. Validation Schemas
const paginationSchema = z.object({
  limit: z.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
```

### 4.2 Migration Plan

1. **Phase 1**: Document existing endpoints to match style guide
2. **Phase 2**: Update response interceptor to enforce envelope
3. **Phase 3**: Standardize error codes across all modules
4. **Phase 4**: Add deprecation headers to non-conforming endpoints

---

## 5 — Consequences

### Positive

- **Client Development**: Predictable patterns reduce integration time
- **Error Handling**: Consistent errors improve debugging
- **Type Safety**: Generated SDKs from OpenAPI enforce contracts
- **Evolution**: Clear versioning and deprecation path
- **Monitoring**: Standardized errors and traces improve observability

### Negative

- **Response Size**: Envelope adds ~100 bytes overhead
- **Migration Effort**: Existing `/shares` endpoint needs minor updates
- **Learning Curve**: New developers must learn conventions

### Risk Mitigation

- Provide comprehensive examples in OpenAPI spec
- Create API client SDK with built-in patterns
- Add linter rules to enforce conventions
- Regular API design reviews

---

## 6 — Examples

### 6.1 Share Creation

```http
POST /v1/shares HTTP/1.1
Content-Type: application/json
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "url": "https://www.tiktok.com/@user/video/123"
}

Response:
HTTP/1.1 202 Accepted
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://www.tiktok.com/@user/video/123",
    "status": "pending",
    "createdAt": "2025-06-09T14:30:00.000Z"
  }
}
```

### 6.2 Validation Error

```http
HTTP/1.1 400 Bad Request
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "The provided URL is not valid",
    "details": {
      "field": "url",
      "constraint": "must be HTTPS URL from supported platform",
      "suggestion": "Supported platforms: tiktok.com, reddit.com, twitter.com, x.com"
    },
    "timestamp": "2025-06-09T14:30:00.000Z",
    "traceId": "trace_abc123"
  }
}
```

### 6.3 Paginated Response

```http
GET /v1/shares?limit=2&cursor=2025-06-09T12:00:00.000Z_abc123

HTTP/1.1 200 OK
{
  "success": true,
  "data": {
    "items": [
      { "id": "456", "url": "...", "createdAt": "2025-06-09T11:00:00.000Z" },
      { "id": "789", "url": "...", "createdAt": "2025-06-09T10:00:00.000Z" }
    ],
    "cursor": "2025-06-09T10:00:00.000Z_789",
    "hasMore": true,
    "limit": 2
  }
}
```

---

## 7 — Documentation Plan

1. **OpenAPI Specification**: Update `apps/api/openapi.yaml` with all patterns
2. **Developer Guide**: Create `docs/api/style-guide.md` with examples
3. **Client Libraries**: Generate TypeScript SDK with proper types
4. **Postman Collection**: Provide importable collection with examples
5. **Error Catalog**: Document all error codes in `docs/api/errors.md`

---

## 8 — Review Checklist

- [ ] All existing endpoints comply or have migration plan
- [ ] Mobile team approves pagination approach
- [ ] Frontend team validates error handling
- [ ] DevOps confirms header requirements
- [ ] OpenAPI spec reflects all conventions
- [ ] Client SDK generation tested

---

## 9 — Links

- REST API Guidelines (Microsoft) → https://github.com/microsoft/api-guidelines
- JSON:API Specification → https://jsonapi.org/
- OpenAPI 3.0 Specification → https://swagger.io/specification/
- ADR-004 → Shares Endpoint Design (existing patterns)
- Task 1.12 → Create API style guide (requirement source)
