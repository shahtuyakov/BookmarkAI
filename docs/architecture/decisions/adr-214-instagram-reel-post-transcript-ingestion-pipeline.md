# ADR-214: Instagram Reel Transcript Ingestion Pipeline

- **Status**: Implemented
- **Date**: 2025-01-13
- **Updated**: 2025-01-17
- **Authors**: @bookmarkai-backend
- **Supersedes**: —
- **Superseded by**: —
- **Related**: ADR-021 (Content Fetcher Interface), ADR-025 (Python ML Services), ADR-096 (TikTok Fetcher)

---

## 1 — Context

Instagram presents unique challenges for transcript extraction as Meta provides no official speech-to-text API. Unlike YouTube and TikTok, Instagram's closed ecosystem requires alternative approaches for extracting transcripts from public Reels shared by BookmarkAI users.

**Current State:**
- Content fetcher framework operational with YouTube, TikTok, Reddit fetchers
- TikTok fetcher successfully uses yt-dlp for immediate download during fetch
- ML pipeline (summarization, embeddings) integrated for content enrichment
- Users actively sharing Instagram content requiring transcript enrichment

**Instagram-Specific Constraints:**
- No official transcript API from Meta
- Auto-generated captions not accessible via public APIs
- Must respect Instagram's robots.txt and ToS for public content
- High variance in audio quality and language across Reels
- Need to filter and support only Reels content for MVP

**MVP Scope:**
- Focus exclusively on Instagram Reels (not posts, IGTV, or stories)
- Follow TikTok's proven single-phase processing model
- Implement content classification to optimize processing costs

---

## 2 — Decision

We will implement a **single-phase processing model using yt-dlp + Whisper** for Instagram Reels, following the proven TikTok pattern for simplicity and faster time-to-market.

### 2.1 Architecture Overview

```
Instagram Reel URL Shared
        │
        ▼
┌─────────────────────┐
│   URL Validator     │ (Reels only)
│ & Content Detector  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Instagram Fetcher  │ (5-10s total)
│                     │
│ 1. yt-dlp extract   │
│ 2. Content classify │
│ 3. Store to S3/local│
└────────┬────────────┘
         │
    Return with
  storage location
         │
         ▼
┌─────────────────────┐
│  Share Processor    │
│                     │
│ • Fast track embed  │────► Caption Embedding
│ • Queue ML tasks    │────► Transcription Task
└─────────────────────┘           │
                                  ▼
                          ┌───────────────┐
                          │  ML Pipeline  │
                          │               │
                          │ • Whisper API │
                          │ • GPT-4o-mini │
                          │ • Embeddings  │
                          └───────────────┘
```

### 2.2 Processing Specifications

| Component | Specification | Latency | Cost |
|-----------|---------------|---------|------|
| **yt-dlp Metadata + Download** | Direct extraction (no oEmbed) | 5-10s | $0.00 |
| **Content Classification** | Rule-based detection | < 0.1s | $0.00 |
| **Storage (S3/Local)** | Based on configuration | < 1s | ~$0.0001 |
| **Total Fetch Time** | End-to-end fetcher | 5-10s | ~$0.0001 |
| **ML Pipeline (Async)** | | | |
| **Whisper Transcription** | OpenAI Whisper API | 5-20s | $0.006/min |
| **Summarization** | GPT-3.5-turbo | 2-5s | $0.001 |
| **Embeddings** | text-embedding-3-small | < 1s | $0.00002 |

**Implementation Note**: Instagram's oEmbed API requires authentication, so we use yt-dlp for both metadata extraction and video download in a single operation.

### 2.3 URL Filtering & Content Detection

Only Instagram Reels are supported in MVP. All other content types will be rejected with appropriate error messages.

| URL Pattern | Content Type | Supported | Error Message |
|-------------|--------------|-----------|---------------|
| `/reel/[ID]` or `/reels/[ID]` | Reel | ✅ Yes | - |
| `/p/[ID]` | Post | ❌ No | "Regular Instagram posts are not supported. Please share Instagram Reels instead." |
| `/tv/[ID]` | IGTV | ❌ No | "IGTV videos are not supported. Please share Instagram Reels instead." |
| `/stories/[USER]/[ID]` | Stories | ❌ No | "Instagram Stories cannot be saved as they are temporary content." |
| `/[USERNAME]/` | Profile | ❌ No | "Profile pages cannot be saved. Please share specific Reels instead." |
| `/direct/` | Direct | ❌ No | "Direct messages cannot be saved. Please share public Reels instead." |

### 2.4 Content Classification for Reels

Reels will be classified to optimize processing costs and skip transcription for non-speech content:

| Classification | Detection Criteria | Processing Strategy | Priority | Cost Saving |
|----------------|-------------------|-------------------|----------|-------------|
| **Standard Reel** | Default for speech content | Full pipeline | 7 | - |
| **Music/Dance** | #music, #dance, trending audio | Skip transcription | 1 | ~70% |
| **Tutorial** | #tutorial, #howto, educational keywords | Comprehensive summary | 9 | - |
| **Meme/Reaction** | #meme, #reaction patterns | Basic summary | 5 | - |

Classification indicators:
- **Audio metadata**: Original vs trending audio
- **Hashtags**: Content-specific tags (#music, #tutorial, #dance)
- **Caption keywords**: Educational terms, music references
- **Duration patterns**: Very short (<5s) often non-speech

---

## 3 — Database Schema

Following the TikTok pattern, Instagram-specific metadata is stored in the shares table's platform_data JSONB field rather than a separate table:

```typescript
// Instagram platform_data structure
{
  // yt-dlp extracted data
  title: string;              // Video title from yt-dlp
  description: string;        // Video description
  uploader: string;           // Instagram username
  uploadDate: string;         // Upload date
  viewCount?: number;         // View count if available
  
  // Instagram specific
  reelId: string;             // Extracted from URL
  contentType: string;        // instagram_reel_standard, instagram_reel_music, etc.
  processingStrategy: {
    type: string;
    priority: number;
    shouldTranscribe: boolean;
    downloadStrategy: string;
    transcriptionStrategy: string;
    summaryComplexity: string;
  };
  hashtags: string[];         // Extracted hashtags
  
  // Storage information
  storageUrl: string;         // S3 or local path
  storageType: 'local' | 's3';
  downloadSuccess: boolean;
  
  // Processing flags
  shouldTranscribe: boolean;
  processingPriority: number;
}
```

The instagram_content table was created but is not actively used in the current implementation, as all data is stored in the existing shares and ml_results tables.

---

## 4 — Implementation Details

### 4.1 Instagram Fetcher Implementation (Following TikTok Pattern)

```typescript
export class InstagramFetcher extends BaseContentFetcher {
  async fetch(request: FetchRequest): Promise<FetchResponse> {
    // 1. Validate URL is a Reel
    const urlInfo = this.instagramUrlParser.parse(request.url);
    if (urlInfo.type !== InstagramUrlType.REEL) {
      throw new FetcherError(
        FetcherErrorCode.UNSUPPORTED_CONTENT_TYPE,
        UNSUPPORTED_CONTENT_MESSAGES[urlInfo.type]
      );
    }
    
    // 2. Use yt-dlp to extract metadata and download video
    const ytDlpResult = await this.ytDlpService.extractVideoInfo(request.url, true);
    
    // 3. Extract metadata from yt-dlp result
    const metadata = {
      author_name: ytDlpResult.uploader || 'Unknown',
      caption: ytDlpResult.description || ytDlpResult.title || '',
      hashtags: this.extractHashtags(ytDlpResult.description || ''),
    };
    
    // 4. Classify content type
    const contentType = this.classifier.classify({
      author: metadata.author_name,
      caption: metadata.caption,
      duration: ytDlpResult.duration,
      hashtags: metadata.hashtags,
    });
    const strategy = INSTAGRAM_PROCESSING_STRATEGIES[contentType];
    
    // 5. Return response with storage location
    return {
      content: {
        text: sanitizeContent(metadata.caption),
        platform: Platform.INSTAGRAM,
        platformId: urlInfo.contentId,
        author: sanitizeContent(metadata.author_name),
      },
      platformData: {
        // yt-dlp extracted data
        title: ytDlpResult.title,
        description: ytDlpResult.description,
        uploader: ytDlpResult.uploader,
        uploadDate: ytDlpResult.uploadDate,
        viewCount: ytDlpResult.viewCount,
        // Instagram specific
        reelId: urlInfo.contentId,
        contentType: contentType,
        processingStrategy: strategy,
        hashtags: metadata.hashtags,
        shouldTranscribe: strategy.shouldTranscribe,
        processingPriority: strategy.priority,
        storageUrl: ytDlpResult.storageUrl,
        storageType: ytDlpResult.storageType,
        downloadSuccess: !!ytDlpResult.storageUrl,
      },
    };
  }
}
```

**Key Implementation Details:**
- Direct yt-dlp extraction without oEmbed API (authentication not required)
- Content classification based on hashtags, caption keywords, and duration
- All metadata stored in platform_data JSONB field
- Graceful error handling for private content or download failures

### 4.2 ShareProcessor Integration

The existing ShareProcessor will handle Instagram Reels automatically through the video enhancement workflow:

1. **Fast Track**: Generate immediate embedding from caption/hashtags
2. **Enhancement Track**: Queue transcription task if `shouldTranscribe` is true
3. **ML Pipeline**: Process with existing Whisper → Summarization → Embeddings flow

### 4.3 Error Handling Strategy

Following TikTok's proven patterns:
- **URL Validation**: Reject non-Reel URLs with clear error messages
- **Download Failures**: Log warning but still return metadata for basic functionality
- **Private Content**: Return specific error code for private Reels
- **Rate Limiting**: Use existing WorkerRateLimiterService with Instagram configuration
- **Graceful Degradation**: Fall back to caption-only if download fails

### 4.4 Platform Verification Updates

Updated across the system to support Instagram URLs:
- **API Gateway**: CreateShareDto regex validation includes instagram.com and instagr.am
- **Common Validation**: shares.schema.ts PlatformSchema includes Instagram
- **Mobile iOS**: ShareViewController.swift supports Instagram URLs
- **Mobile Android**: UrlValidator.kt includes Instagram domain validation
- **SDK**: Modified exports to avoid Node.js dependencies in React Native

---

## 5 — Metrics & SLOs

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Fetch Latency (p95)** | < 8s | > 10s for 5min |
| **Download Success Rate** | > 85% | < 75% for 10min |
| **Content Classification Accuracy** | > 90% | Manual review |
| **Transcription Success Rate** | > 90% | < 80% for 10min |
| **Cost per Reel (non-music)** | < $0.008 | > $0.012 daily avg |
| **Music/Dance Skip Rate** | > 60% | < 50% weekly avg |

### 5.1 Prometheus Metrics
- `instagram_fetch_duration_seconds{quantile}`
- `instagram_content_type_total{type}`
- `instagram_download_success_rate`
- `instagram_transcription_skipped_total{reason}`
- `instagram_processing_cost_dollars{content_type}`

---

## 6 — Security & Compliance

### 6.1 Data Handling
- Process only public Reels and Posts shared by authenticated users
- Auto-delete downloaded media files after transcription
- S3 lifecycle: 30-day retention for debugging, then permanent deletion
- No storage of Instagram user data beyond public username

### 6.2 GDPR Compliance
- User deletion triggers cascade delete across all Instagram tables
- Transcripts and ML outputs included in data export
- No PII extraction from audio content
- Audit logging for all data access

### 6.3 Platform Compliance
- Respect robots.txt and rate limits
- No automated scraping or bot behavior
- Process content only when explicitly shared by users
- No redistribution of downloaded content

---

## 7 — Cost Analysis

With content classification and music/dance filtering:

| Component | Unit Cost | Est. Volume/Day | Daily Cost |
|-----------|-----------|-----------------|------------|
| **Whisper API** | $0.006/min | 600 min* | $3.60 |
| **GPT-4o-mini** | $0.001/summary | 1,200 | $1.20 |
| **Embeddings** | $0.00002/req | 4,000 | $0.08 |
| **Storage (S3)** | $0.023/GB | 15 GB** | $0.35 |
| **Total** | | | **$5.23** |

*Assuming 70% are music/dance content that skip transcription
**Audio-only storage reduces size by ~80%

---

## 8 — Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **yt-dlp breakage** | Service disruption | Monitor success rates; maintain yt-dlp updates |
| **Whisper API limits** | Throttling | Implement queue-based rate limiting |
| **High audio files** | Cost overrun | Set 10-minute duration cap |
| **Private content** | Processing failures | Graceful error handling with user messaging |
| **Instagram changes** | Metadata loss | Cache oEmbed responses; monitor API changes |

---

## 9 — Migration Strategy

### 9.1 Implementation Summary (Completed)

**What was built:**
1. **Instagram URL Parser**: Detects and validates Instagram content types (Reels only)
2. **Content Classifier**: Categorizes Reels for processing optimization
3. **Instagram Fetcher**: Uses yt-dlp for metadata extraction and video download
4. **Platform Integration**: Updated platform enums, validation, and mobile support
5. **Rate Limiting**: Configured Instagram-specific rate limits
6. **ML Pipeline**: Integrated with existing Whisper, summarization, and embedding services

**Key Decisions Made:**
- Used yt-dlp directly instead of oEmbed API (authentication requirement)
- Stored all data in existing tables (shares, ml_results) rather than instagram_content
- Followed TikTok's single-phase pattern for simplicity
- Implemented content classification for cost optimization

### 9.2 Production Metrics (Initial Results)
- **Fetch Success**: ✅ 100% (1/1 test)
- **Processing Time**: ~9 seconds for fetch + download
- **ML Pipeline**: Successfully transcribed and summarized
- **Storage**: S3 upload working correctly
- **Mobile Support**: URLs pass validation on iOS and Android

---

## 10 — Future Enhancements

1. **Expand Content Support**: Add regular posts and IGTV videos
2. **Advanced Classification**: ML-based content detection instead of rule-based
3. **Language Detection**: Auto-detect language for multi-lingual transcription
4. **Carousel Support**: Process multiple videos in carousel posts
5. **Visual Analysis**: Extract key frames for visual content understanding
6. **Two-Phase Model**: Consider YouTube-style processing for longer content
7. **Trending Audio Cache**: Skip download for known music tracks
8. **Instagram-Specific Table**: Migrate platform_data to dedicated instagram_content table
9. **Metrics Dashboard**: Add Instagram-specific metrics to Grafana
10. **Authentication Support**: Implement OAuth for accessing private content with user consent

---

## References

- yt-dlp Documentation: https://github.com/yt-dlp/yt-dlp
- OpenAI Whisper API: https://platform.openai.com/docs/guides/speech-to-text
- Instagram oEmbed: https://developers.facebook.com/docs/instagram/oembed
- ADR-096: TikTok Content Fetcher Implementation
- ADR-025: Python ML Services Architecture
- ADR-021: Content Fetcher Interface