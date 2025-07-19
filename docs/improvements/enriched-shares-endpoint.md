# Enriched Shares Endpoint

## Overview

Create a new API endpoint that returns shares with their ML results (summaries, transcripts) included in a single response. This eliminates the need for multiple API calls from the mobile app and provides better performance.

## Problem Statement

Currently:
- The `/shares` endpoint returns only basic share information
- ML results (summary, transcript) are stored in a separate `ml_results` table
- Mobile app needs to make additional API calls to `/ml/analytics/transcription/result/{shareId}` for each share
- This creates performance issues and complex loading states in the ShareCard component

## Solution

Create new enriched endpoints that join shares with their ML results:

### 1. List Endpoint
```
GET /v1/shares/enriched
```

### 2. Single Share Endpoint
```
GET /v1/shares/{id}/enriched
```

## API Design

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `limit` | number | Items per page (default: 20, max: 100) | `limit=20` |
| `cursor` | string | Pagination cursor | `cursor=eyJpZCI6IjEyMzQ1Njc4In0=` |
| `platform` | string | Filter by platform(s) | `platform=tiktok,youtube` |
| `mlStatus` | string | ML processing status | `mlStatus=complete` |
| `mediaType` | string | Type of media | `mediaType=video` |
| `status` | string | Share processing status | `status=done` |
| `hasTranscript` | boolean | Only shares with transcripts | `hasTranscript=true` |
| `since` | date | Shares created after date | `since=2024-01-01` |

### Response Structure

```typescript
interface EnrichedShareResponse {
  items: EnrichedShare[];
  cursor?: string;
  hasMore: boolean;
  limit: number;
}

interface EnrichedShare {
  // Base share fields
  id: string;
  url: string;
  platform: Platform;
  status: ShareStatus;
  title?: string;
  description?: string;
  author?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaType?: 'video' | 'image' | 'audio' | 'none';
  platformData?: any;
  createdAt: string;
  updatedAt: string;
  
  // ML results
  mlResults?: {
    summary?: string;
    keyPoints?: string[];
    transcript?: string;
    language?: string;
    duration?: number;
    hasEmbeddings?: boolean;
    processingStatus: {
      summary: 'pending' | 'processing' | 'done' | 'failed' | 'not_applicable';
      transcript: 'pending' | 'processing' | 'done' | 'failed' | 'not_applicable';
      embeddings: 'pending' | 'processing' | 'done' | 'failed' | 'not_applicable';
    };
    processedAt?: {
      summary?: string;
      transcript?: string;
      embeddings?: string;
    };
    error?: {
      summary?: string;
      transcript?: string;
      embeddings?: string;
    };
  };
}
```

### Filter Values

**Platform:**
- `tiktok`
- `reddit`
- `twitter` / `x`
- `youtube`
- `instagram`
- `generic`

**ML Status:**
- `complete` - All applicable ML processing done
- `partial` - Some ML results available
- `none` - No ML results yet
- `failed` - ML processing failed

**Media Type:**
- `video`
- `image`
- `audio`
- `none`

## Implementation Steps

### Phase 1: Backend Implementation ✅ COMPLETE (2025-01-18)
1. ✅ Create new DTOs for enriched shares
   - Created `EnrichedShareDto` extending `ShareDto` with `mlResults`
   - Created `MLResultsDto` with summary, transcript, keyPoints, processing status
   - Created `GetEnrichedSharesQueryDto` with all filter parameters
   
2. ✅ Add repository method to fetch shares with ML results joined
   - Implemented `findEnrichedShares()` with SQL subqueries for ML results
   - Implemented `findEnrichedShareById()` for single share
   - Used efficient subqueries instead of JOINs to avoid N+1 problems
   
3. ✅ Implement filtering logic
   - Platform filtering (comma-separated values)
   - ML status filtering (complete/partial/none/failed)
   - Media type filtering
   - Transcript availability filter
   - Date range filtering with `since` parameter
   - All filters work in combination
   
4. ✅ Create controller endpoints
   - `GET /v1/shares/enriched` - List endpoint with pagination
   - `GET /v1/shares/enriched/{id}` - Single share endpoint
   - Full Swagger/OpenAPI documentation
   - Proper error handling and auth guards
   
5. ✅ Add OpenAPI documentation
   - Updated `apps/api/openapi.yaml` with new paths
   - Added schema definitions for all new DTOs
   - Included detailed parameter descriptions and examples
   
6. ✅ Update SDK types
   - Generated new TypeScript types with `pnpm run generate`
   - New types: `EnrichedShareDto`, `MLResultsDto`, `PaginatedEnrichedSharesDto`
   - New service: `EnrichedSharesService` with typed methods

### Phase 2: Mobile App Updates (Next Steps)
1. Update ShareCard component to use enriched data
2. Remove separate ML result fetching logic
3. Update share list screens to use new endpoint
4. Add filtering UI components

### Phase 3: Optimization (Future)
1. Optimize database queries with proper indexes
2. Add caching

## Benefits

1. **Performance**: Single API call instead of N+1 queries
2. **Simplicity**: ShareCard component just displays data
3. **Consistency**: All clients get same enriched data
4. **Future-proof**: Easy to add new ML result types
5. **User Experience**: Faster loading, no cascading updates

## Example Usage

### Get videos with complete ML processing:
```
GET /v1/shares/enriched?platform=tiktok,youtube&mlStatus=complete&mediaType=video&limit=20
```

### Get recent shares from specific platform:
```
GET /v1/shares/enriched?platform=reddit&since=2024-01-15&limit=50
```

### Get shares needing transcript review:
```
GET /v1/shares/enriched?hasTranscript=true&mlStatus=partial
```

## Migration Notes

- Existing `/shares` endpoint remains unchanged
- Mobile app can gradually migrate to enriched endpoint
- Web interface can choose appropriate endpoint based on needs

## Implementation Details

### Files Created/Modified

**New Files:**
- `packages/api-gateway/src/modules/shares/dto/enriched-share.dto.ts`
- `packages/api-gateway/src/modules/shares/dto/get-enriched-shares-query.dto.ts`
- `packages/api-gateway/src/modules/shares/services/enriched-shares.service.ts`
- `packages/api-gateway/src/modules/shares/controllers/enriched-shares.controller.ts`
- `packages/api-gateway/src/modules/shares/decorators/swagger-response.decorator.ts`

**Modified Files:**
- `packages/api-gateway/src/modules/shares/repositories/shares.repository.ts` - Added `findEnrichedShares()` and `findEnrichedShareById()` methods
- `packages/api-gateway/src/modules/shares/shares.module.ts` - Registered new controller and service
- `apps/api/openapi.yaml` - Added new endpoints and schemas
- SDK types regenerated in `packages/sdk/src/generated/`

### Technical Decisions

1. **SQL Subqueries over JOINs**: Used correlated subqueries to fetch ML results to avoid complex JOIN operations and maintain query performance
2. **Client-side ML Status Filtering**: Some filters (mlStatus, hasTranscript) are applied after database query for flexibility
3. **Processing Status Logic**: Implemented smart status detection based on share status and media type
4. **Optional ML Results**: ML results are optional in the response, allowing graceful handling of shares without processing

## Security Considerations

- Maintain same authentication as existing shares endpoint
- User can only see their own shares
- ML results filtered based on share ownership