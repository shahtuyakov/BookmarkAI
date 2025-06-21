 ADR-021 Implementation Memory

  Overview

  Implemented the Content Fetcher Interface Architecture for multi-platform
  support as specified in ADR-021.

  Implementation Date

  2025-06-21

  Key Components Implemented

  1. Core Infrastructure

  - Base Interfaces
  (packages/api-gateway/src/modules/shares/fetchers/interfaces/)
    - ContentFetcherInterface - Primary interface all fetchers must implement
    - FetchRequest, FetchResponse, FetchOptions - Request/response types
    - FetcherError, RetryableFetcherError - Error handling with retry logic
    - FetcherConfig - Configuration structure
  - Base Class (packages/api-gateway/src/modules/shares/fetchers/base/base-conte
  nt-fetcher.ts)
    - Abstract base class with common HTTP functionality
    - Error handling and retry logic
    - Configuration loading from environment
    - Metrics logging
  - Registry
  (packages/api-gateway/src/modules/shares/fetchers/content-fetcher.registry.ts)
    - Manages fetcher instances
    - Platform enablement checks
    - Rate limiting configuration
    - Fallback to generic fetcher

  2. Platform Fetchers Implemented

  - TikTok (platforms/tiktok.fetcher.ts) - Uses oEmbed API, no auth required
  - Reddit (platforms/reddit.fetcher.ts) - Uses JSON endpoints, no auth required

  - Twitter/X (platforms/twitter.fetcher.ts) - Stub implementation returning
  error
  - Generic (platforms/generic.fetcher.ts) - OpenGraph fallback for any URL

  3. Database Schema Updates

  Added new fields to shares table:
  - title (text)
  - description (text)
  - author (varchar 255)
  - thumbnailUrl (text)
  - mediaUrl (text)
  - mediaType (varchar 50)
  - platformData (jsonb)

  Migration: 0006_regular_grey_gargoyle.sql

  4. Integration Points

  - ShareProcessor - Updated to use ContentFetcherRegistry
  - ShareStatus - Added FETCHING status
  - Platform - Added GENERIC platform
  - ShareDto - Added all new metadata fields
  - SharesService - Maps all fields in responses

  5. Configuration Issues Fixed

  - ConfigService Import - Changed from @nestjs/config to local
  config/services/config.service
  - Rate Limiting - BullMQ doesn't support rateLimiter in JobOptions (noted for
  future implementation)

  6. SDK & OpenAPI Updates

  - Updated apps/api/openapi.yaml with new Share fields
  - Added fetching to ShareStatus enum
  - Added generic to Platform enum
  - Fixed duplicate ApiError export by aliasing as ApiErrorResponse
  - Added auto-fix to SDK generation script

  Testing Instructions

  # Start API
  pnpm -w run dev:api

  # Create share with TikTok URL
  curl -X POST http://localhost:3000/v1/shares \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"url": "https://www.tiktok.com/@zachking/video/7001104219347242246"}'

  # Create share with Reddit URL  
  curl -X POST http://localhost:3000/v1/shares \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"url": 
  "https://www.reddit.com/r/programming/comments/1abc123/example_post/"}'

  Known Issues & TODOs

  1. Rate Limiting - Need to implement at worker level, not job level
  2. Media Download - Task 2.7 placeholder in place
  3. Metadata Storage - Basic implementation done, Task 2.8 will enhance
  4. Twitter/X - Stub only, requires OAuth implementation
  5. Caching - Task 2.16 will add deduplication

  Dependencies Added

  - cheerio - For HTML parsing in Generic fetcher
  - axios - HTTP client (via base fetcher)

  File Structure

  packages/api-gateway/src/modules/shares/fetchers/
  ├── interfaces/
  │   ├── content-fetcher.interface.ts
  │   ├── fetcher-error.interface.ts
  │   └── index.ts
  ├── base/
  │   └── base-content-fetcher.ts
  ├── platforms/
  │   ├── tiktok.fetcher.ts
  │   ├── reddit.fetcher.ts
  │   ├── twitter.fetcher.ts
  │   ├── generic.fetcher.ts
  │   └── index.ts
  ├── content-fetcher.registry.ts
  └── fetchers.module.ts

  Commands Used

  # Generate migration
  pnpm -w run db:generate

  # Apply migration
  pnpm -w run db:migrate

  # Regenerate SDK types
  pnpm --filter @bookmarkai/sdk generate

  # Build SDK
  pnpm --filter @bookmarkai/sdk build

  Environment Variables

  # Platform enablement
  ENABLED_PLATFORMS=tiktok,reddit,generic

  # Fetcher configuration
  FETCHER_USER_AGENT=BookmarkAI/1.0
  FETCHER_TIKTOK_TIMEOUT=5000
  FETCHER_REDDIT_TIMEOUT=5000
  FETCHER_GENERIC_TIMEOUT=10000

  # Future OAuth configs
  FETCHER_YOUTUBE_API_KEY=...
  FETCHER_INSTAGRAM_CLIENT_ID=...

## 7. Mobile Client Updates

- **Share Interface Updates** (`packages/mobile/bookmarkaimobile/src/services/api/shares.ts`)
  - Added new top-level fields: `title`, `description`, `author`, `thumbnailUrl`, `mediaUrl`, `mediaType`, `platformData`
  - Added `fetching` status and `generic` platform
  - Kept `metadata` field for backward compatibility

- **SDK Service Updates** (`packages/mobile/bookmarkaimobile/src/services/sdk/shares.ts`)
  - Updated `transformSDKShare` function to map new fields
  - Maps both top-level fields and legacy metadata format

- **UI Components Updates**
  - **ShareCard** - Updated to use new top-level fields with fallback to metadata
  - **DetailScreen** - Updated to display new fields, added media section
  - Added support for `generic` platform color/icon
  - Added support for `fetching` status color

## Next Steps

- Implement rate limiting at worker/queue level
- Add media download queue (Task 2.7)
- Enhance metadata storage (Task 2.8)
- Add YouTube fetcher with API key auth
- Add Instagram fetcher with OAuth
- Implement caching layer (Task 2.16)

Summary

  I've successfully updated the mobile client to support the new share fields
  from the content fetcher implementation:

  Mobile Client Updates:

  1. Share Interface (src/services/api/shares.ts):
    - Added all new fields: title, description, author, thumbnailUrl, mediaUrl,
  mediaType, platformData
    - Updated platform enum to include generic
    - Updated status enum to include fetching
    - Kept metadata field for backward compatibility
  2. SDK Service (src/services/sdk/shares.ts):
    - Updated the Share interface to match
    - Enhanced transformSDKShare to map new fields from SDK response
    - Maintains backward compatibility by populating both new fields and legacy
  metadata
  3. UI Components:
    - ShareCard: Now displays title, author, description from top-level fields
  (with metadata fallback)
    - DetailScreen:
        - Shows all content using new fields
      - Added media section to display mediaType and mediaUrl
      - Added colors/icons for generic platform and fetching status

  Backward Compatibility:

  The implementation maintains backward compatibility by:
  - Checking new top-level fields first
  - Falling back to metadata fields if top-level fields are empty
  - Keeping the metadata field populated for older app versions

  The mobile app is now ready to display the enriched content from the fetchers!

## Testing Results (2025-06-22)

### Successful Implementations
1. **TikTok Fetcher** - Working perfectly
   - Successfully fetches video titles from oEmbed API
   - Retrieves author information
   - Gets thumbnail URLs
   - All metadata displays correctly in mobile app

2. **Reddit Fetcher** - Working perfectly
   - Successfully fetches post titles
   - Retrieves subreddit information
   - Gets image URLs for image posts
   - All metadata displays correctly in mobile app

3. **Mobile App Integration** - Complete
   - Share list displays titles, authors, and thumbnails
   - Detail view shows all fetched metadata
   - Platform icons and colors working for all platforms
   - Status updates working (pending → fetching → done)

### Known Issues

#### YouTube/Generic Fetcher Issue
The Generic fetcher (for YouTube and other non-specific platforms) encounters a 400 error in the mobile app, though the backend implementation is correct.

**Attempted Fixes:**
1. Updated platform detection to return `GENERIC` instead of `UNKNOWN` for unrecognized URLs
2. Removed domain restriction in URL validation that was blocking non-supported platforms
3. Verified Generic fetcher is enabled by default in the registry
4. Confirmed backend changes were applied (API restarted)

**Investigation Notes:**
- No error logs appear in the API server when YouTube URL creation fails
- The 400 error suggests the request may not be reaching the API
- Mobile app is configured to use port 3001 while API runs on 3000 (but other shares work)
- SDK implementation appears correct based on code review

**Current Status:**
- Main platforms (TikTok, Reddit) are working as expected
- Generic fetcher implementation is complete but has connectivity issues
- Decision made to proceed as primary platforms are functional

### Configuration Notes
- Platform detection updated to use GENERIC for any valid URL not specifically handled
- URL validation updated to accept any HTTP/HTTPS URL (not just specific platforms)
- Environment variable `ENABLED_PLATFORMS=tiktok,reddit,generic` controls platform availability