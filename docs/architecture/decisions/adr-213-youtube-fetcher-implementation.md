# ADR-213: YouTube Fetcher Implementation with Two-Phase Processing

- **Status**: Partially Implemented (Phase 1 Complete)
- **Date**: 2025-01-13
- **Authors**: @bookmarkai-backend
- **Updated**: 2025-07-13 - Phase 1 implementation completed
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

## Implementation Status (Updated 2025-07-13)

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

### Phase 2: Pending Implementation 🚧

The following components are ready to be implemented for background enhancement:

1. **YouTube Enhancement Queue** 🚧
   - BullMQ queue for background processing
   - Priority-based job scheduling
   - Retry mechanism for failed jobs

2. **YouTube Enhancement Processor** 🚧
   - Background job processor for Phase 2
   - Smart download decision logic
   - Integration with existing ML pipeline

3. **YouTube Download Service** 🚧
   - yt-dlp integration for video/audio download
   - Quality selection based on content type
   - Storage management and cleanup

4. **Transcription Integration** 🚧
   - Whisper service integration
   - Caption API fallback strategy
   - Chunking for long videos

5. **Chapter Extraction** 🚧
   - Chapter detection from description
   - Timestamp parsing and validation
   - Chapter-based embedding generation

### 16.3 Key Implementation Decisions Made:

1. **API Key Configuration**: Used existing `YOUTUBE_API_KEY` instead of `FETCHER_YOUTUBE_API_KEY` pattern
2. **URL Support**: Added YouTube Shorts URL format to validation patterns
3. **Response Handling**: Adapted to Axios response format (`response.data` instead of `response.json()`)
4. **Database Schema**: Fixed date field default value for PostgreSQL compatibility
5. **Content Classification**: Music videos skip transcription, Shorts get high priority

### Metrics and Monitoring:

Current implementation provides:
- API quota usage tracking with detailed logging
- Content type classification metrics
- Processing time measurements
- Error tracking with specific YouTube error codes

### Next Steps:

1. Implement YouTube Enhancement Queue and Processor
2. Create YouTube Download Service with yt-dlp
3. Integrate with existing Transcription Service
4. Implement chapter extraction logic
5. Add comprehensive integration tests
6. Deploy to staging for real-world testing
