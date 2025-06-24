# ML Analytics API Documentation

This document describes the ML Analytics API endpoints available in the BookmarkAI API Gateway.

## Base URL
```
https://api.bookmarkai.com/ml/analytics
```

## Authentication
All endpoints require JWT authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### 1. Get Transcription Cost Summary
Get aggregated cost statistics for transcriptions over a specified time period.

**Endpoint:** `GET /ml/analytics/transcription/costs`

**Query Parameters:**
- `hours` (optional, number): Number of hours to look back (default: 24, min: 1, max: 720)

**Response:**
```json
{
  "periodHours": 24,
  "totalCostUsd": 12.45,
  "totalDurationSeconds": 124500,
  "totalDurationHours": 34.58,
  "transcriptionCount": 156,
  "avgCostPerTranscription": 0.0798,
  "avgDurationSeconds": 798.08,
  "costPerHour": 0.36,
  "breakdown": {
    "api": 12.45,
    "local": 0
  }
}
```

### 2. Get Detailed Transcription Costs
Get detailed cost records for individual transcriptions.

**Endpoint:** `GET /ml/analytics/transcription/costs/detailed`

**Query Parameters:**
- `hours` (optional, number): Number of hours to look back (default: 24, min: 1, max: 720)
- `limit` (optional, number): Number of results to return (default: 100, min: 1, max: 1000)
- `offset` (optional, number): Number of results to skip (default: 0)

**Response:**
```json
{
  "costs": [
    {
      "shareId": "uuid-1234",
      "audioDurationSeconds": 245.5,
      "billingUsd": 0.0245,
      "backend": "api",
      "createdAt": "2024-06-24T10:30:00Z"
    }
  ],
  "total": 156
}
```

### 3. Get ML Task Summary
Get summary statistics for all ML task types (transcription, summarization, embedding).

**Endpoint:** `GET /ml/analytics/tasks/summary`

**Query Parameters:**
- `hours` (optional, number): Number of hours to look back (default: 24, min: 1, max: 720)

**Response:**
```json
[
  {
    "taskType": "transcription",
    "count": 156,
    "avgProcessingMs": 3500,
    "totalProcessingMs": 546000,
    "lastProcessedAt": "2024-06-24T11:45:00Z"
  },
  {
    "taskType": "summarization",
    "count": 89,
    "avgProcessingMs": 2100,
    "totalProcessingMs": 186900,
    "lastProcessedAt": "2024-06-24T11:40:00Z"
  }
]
```

### 4. Get Budget Status
Get current budget usage and remaining allocation.

**Endpoint:** `GET /ml/analytics/budget/status`

**Response:**
```json
{
  "hourly": {
    "used": 0.85,
    "limit": 1.00,
    "remaining": 0.15,
    "percentUsed": 85.0
  },
  "daily": {
    "used": 8.45,
    "limit": 10.00,
    "remaining": 1.55,
    "percentUsed": 84.5
  }
}
```

### 5. Get Transcription Result
Get the transcription result for a specific share.

**Endpoint:** `GET /ml/analytics/transcription/result/:shareId`

**Path Parameters:**
- `shareId` (required, string): The share ID to retrieve transcription for

**Response:**
```json
{
  "id": "result-uuid",
  "shareId": "share-uuid",
  "modelVersion": "whisper-1-api",
  "processingMs": 3500,
  "createdAt": "2024-06-24T10:30:00Z",
  "text": "Full transcription text...",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "text": "Segment text"
    }
  ],
  "language": "en",
  "duration_seconds": 245.5,
  "billing_usd": 0.0245,
  "backend": "api"
}
```

**Error Response (404):**
```json
{
  "statusCode": 404,
  "message": "Transcription result not found"
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "statusCode": 400,
  "message": "Hours must be between 1 and 720"
}
```

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error"
}
```

## Usage Examples

### cURL
```bash
# Get cost summary for last 24 hours
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.bookmarkai.com/ml/analytics/transcription/costs

# Get budget status
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.bookmarkai.com/ml/analytics/budget/status

# Get transcription result
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://api.bookmarkai.com/ml/analytics/transcription/result/share-uuid-123
```

### JavaScript
```javascript
const api = axios.create({
  baseURL: 'https://api.bookmarkai.com',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Get cost summary
const costSummary = await api.get('/ml/analytics/transcription/costs?hours=48');

// Get budget status
const budgetStatus = await api.get('/ml/analytics/budget/status');
```

## Rate Limiting
- Analytics endpoints are rate limited to 100 requests per minute per user
- Detailed cost queries are limited to 20 requests per minute

## Notes
- Cost data is updated in real-time as transcriptions are processed
- Budget limits are configured via environment variables on the server
- Historical data retention is 90 days