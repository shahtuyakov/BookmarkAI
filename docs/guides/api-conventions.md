# BookmarkAI API Conventions (ADR-012)

This guide documents the API conventions implemented in BookmarkAI following ADR-012.

## Table of Contents

- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Pagination](#pagination)
- [Field Selection](#field-selection)
- [Rate Limiting](#rate-limiting)
- [Authentication](#authentication)
- [Validation](#validation)
- [Headers](#headers)
- [Examples](#examples)

## Response Format

All API responses follow a standard envelope format:

### Success Response

```json
{
  "success": true,
  "data": <response_data>,
  "meta": {
    "requestId": "123e4567-e89b-12d3-a456-426614174000",
    "version": "1.0.0",
    "deprecation": "2026-01-01T00:00:00.000Z" // optional
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CATEGORY_SPECIFIC",
    "message": "Human readable message",
    "details": {
      "field": "url",
      "constraint": "must be HTTPS URL from supported platform",
      "suggestion": "Supported platforms: tiktok.com, reddit.com, twitter.com, x.com"
    },
    "timestamp": "2025-06-09T14:30:00.000Z",
    "traceId": "trace_123e4567"
  }
}
```

## Error Handling

### Error Code Taxonomy

Errors follow a hierarchical naming convention: `CATEGORY_SPECIFIC_ERROR`

#### Categories:

| Category             | Pattern        | Examples                                         |
| -------------------- | -------------- | ------------------------------------------------ |
| **Validation**       | `INVALID_*`    | `INVALID_URL`, `INVALID_EMAIL_FORMAT`            |
| **Authentication**   | `AUTH_*`       | `AUTH_TOKEN_EXPIRED`, `AUTH_INVALID_CREDENTIALS` |
| **Authorization**    | `FORBIDDEN_*`  | `FORBIDDEN_RESOURCE_ACCESS`                      |
| **Not Found**        | `NOT_FOUND_*`  | `NOT_FOUND_SHARE`, `NOT_FOUND_USER`              |
| **Conflict**         | `CONFLICT_*`   | `CONFLICT_DUPLICATE_EMAIL`                       |
| **Rate Limiting**    | `RATE_LIMIT_*` | `RATE_LIMIT_EXCEEDED`                            |
| **External Service** | `EXTERNAL_*`   | `EXTERNAL_TIKTOK_UNAVAILABLE`                    |
| **Server Error**     | `SERVER_*`     | `SERVER_DATABASE_ERROR`                          |

### Error Details

Errors include structured details to help with debugging and user guidance:

- `field`: The specific field that caused the error
- `constraint`: The rule that was violated
- `suggestion`: How to fix the error

## Pagination

### Cursor-Based Pagination (Default)

Used for feeds and timelines to ensure consistent results:

```http
GET /v1/shares?limit=20&cursor=2025-06-09T12:00:00.000Z_abc123
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [...],
    "cursor": "2025-06-09T11:00:00.000Z_456def",
    "hasMore": true,
    "limit": 20,
    "total": 156 // optional, only if efficiently countable
  }
}
```

### Cursor Format

Cursors use the format: `{timestamp}_{id}`

- Example: `2025-06-09T12:00:00.000Z_abc123`

### Parameters

- `limit`: Number of items (1-100, default: 20)
- `cursor`: Pagination cursor from previous response

## Field Selection

Reduce response payload by selecting specific fields:

```http
GET /v1/shares/123?fields=id,url,platform,status,createdAt
```

Response includes only the requested fields:

```json
{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://www.tiktok.com/@user/video/123",
    "platform": "tiktok",
    "status": "done",
    "createdAt": "2025-06-09T14:30:00.000Z"
  }
}
```

### Available Fields

#### Shares

- `id`, `url`, `title`, `notes`, `status`, `platform`
- `userId`, `metadata`, `createdAt`, `updatedAt`, `processedAt`

#### Users

- `id`, `email`, `name`, `createdAt`, `updatedAt`

## Rate Limiting

### Headers

All responses include rate limiting information:

```http
X-Rate-Limit-Limit: 100
X-Rate-Limit-Remaining: 45
X-Rate-Limit-Reset: 1623456789
X-Rate-Limit-Window: 60
X-Rate-Limit-Policy: 100/1min
```

### Rate Limit Policies

| Endpoint Type    | Limit        | Window     | Policy           |
| ---------------- | ------------ | ---------- | ---------------- |
| Authentication   | 5 requests   | 15 minutes | `auth-strict`    |
| API Standard     | 100 requests | 1 minute   | `api-standard`   |
| Share Creation   | 20 requests  | 1 minute   | `share-create`   |
| Batch Operations | 10 requests  | 5 minutes  | `batch-limited`  |
| File Uploads     | 5 requests   | 1 minute   | `upload-limited` |

### Rate Limit Exceeded

When rate limit is exceeded, you'll receive:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests",
    "details": {
      "retryAfter": 60
    },
    "timestamp": "2025-06-09T14:30:00.000Z",
    "traceId": "trace_123e4567"
  }
}
```

## Authentication

### Headers

```http
Authorization: Bearer <jwt_token>
```

### JWT Token Format

Tokens are signed using RS256 with AWS KMS (or RSA keys locally).

### Token Refresh

```http
POST /v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "rt_123e4567-e89b-12d3-a456-426614174000"
}
```

## Validation

### Request Validation

All requests are validated using Zod schemas with detailed error messages:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "The provided URL is not valid",
    "details": {
      "field": "url",
      "constraint": "must be HTTPS URL from supported platform",
      "suggestion": "Supported platforms: tiktok.com, reddit.com, twitter.com, x.com",
      "validation": [
        {
          "field": "url",
          "message": "Invalid URL format",
          "code": "invalid_url"
        }
      ]
    },
    "timestamp": "2025-06-09T14:30:00.000Z",
    "traceId": "trace_123e4567"
  }
}
```

## Headers

### Request Headers

| Header            | Description                  | Required             | Example                                |
| ----------------- | ---------------------------- | -------------------- | -------------------------------------- |
| `Authorization`   | JWT token for authentication | Yes (auth endpoints) | `Bearer eyJhbGc...`                    |
| `X-Request-ID`    | Request tracing ID           | No                   | `123e4567-e89b-12d3-a456-426614174000` |
| `Idempotency-Key` | Prevent duplicate operations | Yes (mutations)      | `550e8400-e29b-41d4-a716-446655440000` |
| `Content-Type`    | Request content type         | Yes (POST/PUT)       | `application/json`                     |

### Response Headers

| Header           | Description                    | Example                                |
| ---------------- | ------------------------------ | -------------------------------------- |
| `X-Request-ID`   | Request correlation ID         | `123e4567-e89b-12d3-a456-426614174000` |
| `X-Rate-Limit-*` | Rate limiting information      | `Limit: 100, Remaining: 45`            |
| `Retry-After`    | Seconds to wait (rate limited) | `60`                                   |
| `Deprecation`    | Deprecation date               | `Sun, 01 Jan 2026 00:00:00 GMT`        |

## Examples

### Create a Share

```http
POST /v1/shares
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "url": "https://www.tiktok.com/@user/video/123",
  "title": "Interesting TikTok video",
  "notes": "Remember to check this later"
}
```

Response:

```http
HTTP/1.1 202 Accepted
X-Request-ID: 123e4567-e89b-12d3-a456-426614174000
X-Rate-Limit-Limit: 20
X-Rate-Limit-Remaining: 19
X-Rate-Limit-Reset: 1623456849

{
  "success": true,
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "url": "https://www.tiktok.com/@user/video/123",
    "title": "Interesting TikTok video",
    "notes": "Remember to check this later",
    "status": "pending",
    "platform": "tiktok",
    "userId": "user123e4567-e89b-12d3-a456-426614174000",
    "metadata": null,
    "createdAt": "2025-06-09T14:30:00.000Z",
    "updatedAt": "2025-06-09T14:30:00.000Z",
    "processedAt": null
  },
  "meta": {
    "requestId": "123e4567-e89b-12d3-a456-426614174000",
    "version": "1.0.0"
  }
}
```

### List Shares with Filtering

```http
GET /v1/shares?platform=tiktok,reddit&status=done&limit=10&sort=-createdAt&fields=id,url,platform,status,createdAt
Authorization: Bearer <token>
```

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "url": "https://www.tiktok.com/@user/video/123",
        "platform": "tiktok",
        "status": "done",
        "createdAt": "2025-06-09T14:30:00.000Z"
      }
    ],
    "cursor": "2025-06-09T14:30:00.000Z_123e4567",
    "hasMore": false,
    "limit": 10
  },
  "meta": {
    "requestId": "456e7890-e89b-12d3-a456-426614174001",
    "version": "1.0.0"
  }
}
```

### Batch Create Shares

```http
POST /v1/shares/batch
Content-Type: application/json
Authorization: Bearer <token>

{
  "operations": [
    {
      "url": "https://www.tiktok.com/@user1/video/123",
      "idempotencyKey": "550e8400-e29b-41d4-a716-446655440001",
      "title": "First video"
    },
    {
      "url": "https://www.reddit.com/r/example/comments/abc123",
      "idempotencyKey": "550e8400-e29b-41d4-a716-446655440002",
      "title": "Reddit post"
    }
  ]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "succeeded": [
      {
        "id": "123e4567-e89b-12d3-a456-426614174001",
        "url": "https://www.tiktok.com/@user1/video/123",
        "status": "pending",
        "platform": "tiktok",
        "createdAt": "2025-06-09T14:30:00.000Z"
      }
    ],
    "failed": [
      {
        "index": 1,
        "error": {
          "code": "INVALID_URL",
          "message": "The provided URL is not valid",
          "details": {
            "field": "url",
            "constraint": "must be HTTPS URL from supported platform"
          },
          "timestamp": "2025-06-09T14:30:00.000Z",
          "traceId": "trace_123e4567"
        },
        "item": {
          "url": "https://www.reddit.com/r/example/comments/abc123",
          "idempotencyKey": "550e8400-e29b-41d4-a716-446655440002"
        }
      }
    ]
  },
  "meta": {
    "requestId": "789e0123-e89b-12d3-a456-426614174002",
    "version": "1.0.0"
  }
}
```

### Error Response Example

```http
POST /v1/shares
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

{
  "url": "invalid-url"
}
```

Response:

```http
HTTP/1.1 400 Bad Request
X-Request-ID: 123e4567-e89b-12d3-a456-426614174000

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
    "traceId": "trace_123e4567"
  }
}
```

## Migration Notes

When migrating from the previous API format:

1. **Response Wrapping**: All responses are now wrapped in the envelope format
2. **Error Format**: Errors now include structured details and suggestions
3. **Headers**: X-Request-ID is now included in all responses
4. **Rate Limiting**: Rate limit headers are now included
5. **Field Selection**: New `?fields=` parameter for partial responses
6. **Enhanced Filtering**: New date range and multi-value filtering

The migration is backward compatible thanks to the response interceptor that automatically wraps existing responses.
