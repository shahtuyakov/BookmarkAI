# ADR-213: YouTube Fetcher Implementation with Two-Phase Processing

- **Status**: Implemented (Phase 2 Components Complete, Integration Pending)
- **Date**: 2025-01-13
- **Authors**: @bookmarkai-backend
- **Updated**: 2025-01-15 - Phase 2 components implemented, integration pending
- **Supersedes**: —
- **Superseded by**: —
- **Related**: ADR-021 (Content Fetcher Interface), ADR-211 (Rate Limiting), ADR-212 (Distributed Tracing)

---

## 1 — Context

Task 2.15 requires implementing a YouTube content fetcher to support YouTube URL processing in BookmarkAI. YouTube presents unique challenges that require sophisticated content processing workflows, significantly different from the existing TikTok and Reddit fetchers.

**Current Fetcher Architecture:**

- Content fetcher framework established (ADR-021) with strategy pattern
- Base classes, registry system, and error handling operational
- TikTok (oEmbed), Reddit (JSON), Twitter stub, and generic (OpenGraph) fetchers implemented
- Rate limiting infrastructure (ADR-211) and distributed tracing (ADR-212) available

**YouTube-Specific Challenges:**

- **API Quota Management**: YouTube Data API v3 has 10,000 requests/day limit
- **Content Diversity**: Shorts (<60s) vs Standard (1-10min) vs Long (10+ min) vs Music vs Educational content
- **Processing Time Variance**: 2s for Shorts metadata vs 3+ minutes for full long-form enhancement
- **Multiple Data Sources**: API metadata, auto-captions, manual download, chapters
- **Quality vs Speed Trade-offs**: Immediate searchability vs comprehensive content analysis
- **Chapter Support**: Timestamp-based navigation and search requirements

**YouTube Content Processing Requirements:**

1. **Immediate Response** (<5 seconds): Basic metadata extraction for instant searchability
2. **Background Enhancement** (10s-3min): Full content processing with transcription and rich embeddings
3. **Smart Processing**: Content-type-aware strategies for optimal resource usage
4. **Chapter Integration**: Timestamp-based search and navigation
5. **Quota Optimization**: Efficient API usage within daily limits

---

## 2 — Decision

We will implement a **YouTube fetcher using a two-phase processing model** that provides immediate user feedback while performing comprehensive content enhancement in the background.

### 2.1 Two-Phase Processing Architecture

```
YouTube URL Shared
        │
        ▼
┌─────────────────┐
│ Content Fetcher │ (Phase 1: 1-2s)
│ (YouTube API)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │ Content │ (0.1s)
    │Classifier│
    └────┬────┘
         │
    ┌────┴────────────────┬────────────────┬──────────────┐
    ▼                     ▼                ▼              ▼
[Shorts Path]      [Standard Path]   [Long Path]    [Music Path]
 (<60s)           (1-10 min)        (10+ min)      (Detected)
    │                     │                │              │
    ▼                     ▼                ▼              ▼
Quick Embed          Quick Embed       Quick Embed   Metadata Only
(Status: fetched)   (Status: fetched) (Status: fetched) (Status: fetched)
    │                     │                │              │
    └─────────────────────┴────────────────┴──────────────┘
                            │
                            ▼
              [Background Enhancement Queue]
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
    [Smart Download Pipeline]    [Enhancement Pipeline]
    • Quality selection         • Transcription
    • Caption check             • Summarization
    • Audio extraction          • Rich embeddings
              │                           │
              └─────────────┬─────────────┘
                            ▼
                   (Status: enriched)
```

### 2.2 Core Design Decisions

| Aspect                     | Decision                                       | Rationale                                              |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| **Processing Model**       | Two-phase: Immediate + Background              | User satisfaction (fast response) + comprehensive data |
| **Content Classification** | 5 types: Short/Standard/Long/Music/Educational | Optimized processing strategies per content type       |
| **API Strategy**           | Official YouTube Data API v3                   | Reliable, rich metadata, quota management              |
| **Quota Management**       | Intelligent usage tracking with prioritization | Avoid API bans, optimize for high-value content        |
| **Download Strategy**      | Smart quality selection based on content type  | Balance storage costs with transcription quality       |
| **Transcription**          | Hybrid: API captions + Whisper fallback        | Cost optimization with quality assurance               |
| **Chapter Support**        | Separate embeddings per chapter                | Enables timestamp-based search                         |
| **Status Progression**     | `pending` → `fetched` → `enriched`             | Clear state tracking for two-phase processing          |

---

## References

- **ADR-021**: Content Fetcher Interface Architecture - Base pattern and interfaces
- **ADR-211**: Rate Limiting and Back-off Strategy - Worker-level resilience
- **ADR-212**: Distributed Tracing - Observability for multi-phase processing
- **YouTube Data API v3**: Official documentation and best practices
- **Task 2.15**: Original requirement for YouTube fetcher implementation
- **YouTube Workflow Document**: Detailed processing strategies and classification
- **Performance Targets**: Sub-5s searchability with comprehensive background enhancement
- **BullMQ Documentation**: Queue management for background processing
- **OpenTelemetry Integration**: Tracing specifications for enhancement pipeline

---

## Implementation Status (Updated 2025-01-15)

### Implementation Timeline

Recent commits show progressive implementation of YouTube functionality:
- **b341afd** (Initial): Added ADR-213 documenting two-phase processing architecture
- **7541bec** (Phase 1): Implemented YouTube Fetcher with API integration and content classification
- **9a07100** (Phase 2 Start): Added enhancement queue and processor foundation
- **443c9df** (Refactor): Consolidated queue into ShareProcessor, added download service
- **5fe4342** (Transcript): Implemented YouTube transcript service with yt-dlp
- **c8d673b** (Enhancement): Refined processing pipeline, removed youtube-transcript package
- **611bb32** (Polish): Refactored content classification, improved type safety

### Phase 1: Completed ✅

The immediate YouTube API fetch with content classification has been successfully implemented:

#### Completed Components:

1. **YouTube Fetcher (`youtube.fetcher.ts`)** ✅
   - Extends `BaseContentFetcher` with YouTube-specific logic
   - Supports all YouTube URL formats including Shorts (`/shorts/`)
   - Properly loads API key from `YOUTUBE_API_KEY` environment variable
   - Implements Phase 1 fetch with immediate response

2. **Content Classifier (`youtube-content-classifier.ts`)** ✅
   - Accurately classifies content into 5 types:
     - `youtube_short`: Videos < 60 seconds (Priority: 8)
     - `youtube_music`: Music category videos (Priority: 3)
     - `youtube_standard`: Regular videos 1-10 min (Priority: 5)
     - `youtube_long`: Videos > 10 minutes (Priority: 4)
     - `youtube_educational`: Tutorial/educational content (Priority: 6)
   - Implements duration parsing and formatting utilities
   - Successfully detects music content by category ID (10)

3. **Quota Manager (`youtube-quota-manager.ts`)** ✅
   - Tracks API usage with Redis backing
   - Enforces 10,000 daily quota limit
   - Provides real-time quota status and utilization metrics
   - Logs quota usage with remaining balance

4. **Error Handling (`youtube.error.ts`)** ✅
   - YouTube-specific error types with proper error codes
   - Maps YouTube errors to generic fetcher error codes
   - Handles quota exceeded, video not found, and API key errors

5. **Database Schema (`youtube.ts`)** ✅
   - All four YouTube tables created and migrated:
     - `youtube_content`: Video metadata and classification
     - `youtube_chapters`: Chapter storage (ready for Phase 2)
     - `youtube_enhancements`: Processing status tracking
     - `youtube_quota_usage`: API quota monitoring
   - Proper indexes for performance optimization

6. **Integration Points** ✅
   - Registered in content fetcher registry
   - Integrated with share processor workflow
   - URL validation updated to support YouTube URLs
   - Quick embedding generation for immediate searchability

#### Verified Functionality:

- ✅ YouTube Shorts processing: `https://youtube.com/shorts/kzi9MQQ6K3A`
- ✅ Regular YouTube videos: `https://youtu.be/O0WXurYM09k`
- ✅ Music video detection and classification
- ✅ API quota tracking (0.01% usage per request)
- ✅ Proper error handling for invalid URLs
- ✅ Metadata storage in database
- ✅ Quick embedding for searchability

### Phase 2: Implemented Components ✅

The following Phase 2 components have been successfully implemented:

1. **YouTube Enhancement Queue** ✅ (Implemented in commit 9a07100, later refactored in 443c9df)
   - BullMQ queue for background processing implemented
   - Priority-based job scheduling with content-type-aware priorities
   - Retry mechanism with exponential backoff
   - Queue monitoring and metrics collection
   - Note: Later integrated directly into ShareProcessor for streamlined job management

2. **YouTube Enhancement Processor** ✅ (Implemented in commit 443c9df)
   - Background job processor fully implemented
   - Smart processing strategies for different content types:
     - Music: Metadata only, no transcription
     - Shorts: High priority, quick processing
     - Educational: Enhanced summarization
     - Long videos: Chunked processing
   - Integration with existing ML pipeline
   - Comprehensive error handling and job status tracking

3. **YouTube Download Service** ✅ (Implemented in commit 443c9df)
   - yt-dlp integration completed
   - Smart quality selection based on content type:
     - Shorts: 360p or best available under 720p
     - Standard/Long: 480p preferred
     - Music: Audio-only extraction
   - Storage management with automatic cleanup
   - Retry logic for download failures

4. **YouTube Transcript Service** ✅ (Implemented in commit 5fe4342, enhanced in c8d673b)
   - Direct yt-dlp integration for caption/subtitle extraction
   - Support for multiple subtitle formats (SRT, VTT, JSON3)
   - Language preference handling (en, en-US, en-GB)
   - Automatic format conversion to plain text
   - Error handling for throttling and rate limiting
   - Note: Replaced the original plan to use YouTube API captions

5. **Chapter Support** ⚠️ (Partially implemented)
   - Transcript timestamps preserved in extracted text
   - Database schema supports chapter storage
   - Chapter extraction logic pending implementation
   - Chapter-based embedding generation not yet implemented

### Phase 2: Integration Status 🚧

While all Phase 2 components are implemented, the full two-phase processing flow is not yet integrated:

1. **YouTube Fetcher Integration** 🚧
   - Phase 2 enhancement queue code exists but is commented out
   - Currently only triggers Phase 1 processing
   - Needs to be wired to queue enhancement jobs after initial fetch

2. **Share Processor Enhancement** 🚧
   - Currently uses Phase 1 approach with direct transcript fetching
   - Does not utilize the Phase 2 enhancement queue
   - Needs refactoring to support two-phase status progression

3. **Status Progression** 🚧
   - Database schema supports `pending → fetched → enriched` flow
   - Actual implementation still uses single-phase processing
   - Enhancement tracking table not being utilized

### Architecture Evolution

During implementation, several architectural decisions evolved:

1. **Enhancement Queue Consolidation**: The separate `YouTubeEnhancementQueue` service was removed and its functionality integrated directly into `ShareProcessor` for better cohesion.

2. **Transcript Strategy Change**: Instead of using YouTube API captions with Whisper fallback, the implementation uses yt-dlp as the primary transcript source with Whisper as fallback.

3. **Content Type Implementation**: The `YouTubeContentType` enum was replaced with a type-safe map structure for better flexibility and maintainability.

### Key Implementation Decisions Made:

1. **API Key Configuration**: Used existing `YOUTUBE_API_KEY` instead of `FETCHER_YOUTUBE_API_KEY` pattern
2. **URL Support**: Added YouTube Shorts URL format to validation patterns  
3. **Response Handling**: Adapted to Axios response format (`response.data` instead of `response.json()`)
4. **Database Schema**: Fixed date field default value for PostgreSQL compatibility
5. **Content Classification**: Music videos skip transcription, Shorts get high priority
6. **Queue Architecture**: Consolidated enhancement queue functionality into ShareProcessor
7. **Transcript Source**: yt-dlp as primary source instead of YouTube API captions
8. **Package Management**: Removed `youtube-transcript` package in favor of yt-dlp

### Metrics and Monitoring:

Current implementation provides:
- API quota usage tracking with detailed logging
- Content type classification metrics
- Processing time measurements
- Error tracking with specific YouTube error codes

### Next Steps:

1. **Enable Two-Phase Processing Flow** 🔴 (Critical)
   - Wire Phase 2 enhancement queue to YouTube fetcher
   - Uncomment and test enhancement queue integration
   - Implement proper status progression (`pending → fetched → enriched`)

2. **Complete Chapter Support** 🟡 (Important)
   - Implement chapter extraction from video descriptions
   - Parse timestamp formats and validate chapters
   - Generate separate embeddings per chapter
   - Enable timestamp-based search functionality

3. **Refactor Share Processor** 🟡 (Important)
   - Transition from Phase 1 direct processing to Phase 2 queue-based approach
   - Utilize enhancement tracking table for status management
   - Implement proper two-phase status updates

4. **Add Comprehensive Integration Tests** 🟢 (Nice to have)
   - Test full two-phase processing flow
   - Verify content type classification accuracy
   - Test error handling and retry mechanisms
   - Validate quota management under load

5. **Production Deployment & Monitoring** 🟢 (Nice to have)
   - Deploy to staging environment
   - Monitor API quota usage patterns
   - Track processing times by content type
   - Analyze enhancement success rates

6. **Performance Optimization** 🟢 (Future)
   - Implement caching for frequently accessed content
   - Optimize download quality selection algorithm
   - Consider CDN integration for downloaded content

### Known Gaps and Issues:

1. **Two-Phase Processing Not Active**: While all components exist, the actual two-phase flow is not enabled
2. **Enhancement Queue Disconnected**: The queue exists but YouTube fetcher doesn't queue jobs
3. **Status Tracking Incomplete**: Enhancement tracking table not being updated
4. **Chapter Support Minimal**: Database ready but extraction logic missing
5. **Testing Coverage**: No integration tests for the full YouTube pipeline
6. **Monitoring Limited**: Metrics collection implemented but not exposed to monitoring stack
