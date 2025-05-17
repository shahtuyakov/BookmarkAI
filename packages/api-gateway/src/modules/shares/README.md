# Shares Module

## Overview

The Shares module handles the creation and management of shared social media content in BookmarkAI. It provides endpoints for creating shares, listing shares, and retrieving individual share details.

## Features

- **Create Shares**: Accept user-submitted URLs with idempotency support
- **List Shares**: Paginated access to user's shares with cursor-based pagination
- **Get Share**: Retrieve detailed information about a specific share
- **Idempotency**: Prevent duplicate share creation using idempotency keys
- **Rate Limiting**: Protect against abuse with per-user rate limits
- **Platform Detection**: Automatically identify the source platform from URLs

## API Endpoints

### `POST /v1/shares`

Creates a new share.

- **Authorization**: JWT token required
- **Headers**: `Idempotency-Key` (required)
- **Request Body**:
  ```json
  {
    "url": "https://www.tiktok.com/@username/video/1234567890"
  }
  ```
- **Response**: `202 Accepted`
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "url": "https://www.tiktok.com/@username/video/1234567890",
      "platform": "tiktok",
      "status": "pending",
      "createdAt": "2025-05-17T12:34:56.789Z",
      "updatedAt": "2025-05-17T12:34:56.789Z"
    }
  }
  ```

### `GET /v1/shares`

Lists the user's shares with pagination.

- **Authorization**: JWT token required
- **Query Parameters**:
  - `cursor` (optional): Pagination cursor
  - `limit` (optional): Number of items per page (default: 20, max: 100)
  - `platform` (optional): Filter by platform
  - `status` (optional): Filter by status
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "items": [
        {
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "url": "https://www.tiktok.com/@username/video/1234567890",
          "platform": "tiktok",
          "status": "done",
          "createdAt": "2025-05-17T12:34:56.789Z",
          "updatedAt": "2025-05-17T12:34:56.789Z"
        }
      ],
      "cursor": "2025-05-17T12:34:56.789Z_123e4567-e89b-12d3-a456-426614174000",
      "hasMore": true,
      "limit": 20
    }
  }
  ```

### `GET /v1/shares/:id`

Retrieves a specific share by ID.

- **Authorization**: JWT token required
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "url": "https://www.tiktok.com/@username/video/1234567890",
      "platform": "tiktok",
      "status": "done",
      "createdAt": "2025-05-17T12:34:56.789Z",
      "updatedAt": "2025-05-17T12:34:56.789Z"
    }
  }
  ```

## Error Handling

All error responses follow the standard format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

## Idempotency

The service uses Redis to implement idempotency with a TTL of 24 hours. Clients must send an `Idempotency-Key` header with each POST request to uniquely identify the request.

## Rate Limiting

The endpoint implements rate limiting to protect against abuse:
- **POST requests**: 10 requests per 10 seconds per user
- Rate limit information is returned in headers:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Seconds until rate limit resets

## Background Processing

When a share is created, a job is enqueued to process the share asynchronously. The share starts with a status of `pending` and transitions to `processing`, `done`, or `error` as it moves through the pipeline.

## Supported Platforms

- TikTok (`tiktok`)
- Reddit (`reddit`)
- Twitter (`twitter`)
- X (`x`)