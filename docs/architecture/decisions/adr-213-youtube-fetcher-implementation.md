# ADR-213: YouTube Fetcher Implementation with Two-Phase Processing

- **Status**: Proposed
- **Date**: 2025-01-13
- **Authors**: @bookmarkai-backend
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

## 3 — YouTube Content Classification System

### 3.1 Content Type Definitions

```typescript
enum YouTubeContentType {
  SHORT = 'youtube_short', // <60s, vertical videos, fast processing
  STANDARD = 'youtube_standard', // 1-10min, normal processing
  LONG = 'youtube_long', // 10+ min, audio-only processing
  MUSIC = 'youtube_music', // Music content, metadata-focused
  EDUCATIONAL = 'youtube_edu', // Tutorial/lecture, high-quality transcription
}

interface YouTubeProcessingStrategy {
  type: YouTubeContentType;
  processingPriority: number; // 1-10 scale (10 = highest)
  downloadStrategy: 'full' | 'audio' | 'none';
  downloadQuality: '360p' | '720p' | 'audio-only';
  transcriptionStrategy: 'api_captions' | 'whisper_full' | 'whisper_chunked' | 'skip';
  chunkingStrategy?: {
    chunkSize: number; // seconds
    overlap: number; // seconds
    useChapters: boolean;
  };
  summaryComplexity: 'basic' | 'standard' | 'comprehensive';
  expectedProcessingTime: number; // seconds
}
```

### 3.2 Classification Algorithm

```typescript
class YouTubeContentClassifier {
  classifyContent(apiData: YouTubeVideoData): YouTubeProcessingStrategy {
    const duration = this.parseDuration(apiData.contentDetails.duration);
    const title = apiData.snippet.title.toLowerCase();
    const description = apiData.snippet.description.toLowerCase();
    const tags = apiData.snippet.tags || [];
    const categoryId = apiData.snippet.categoryId;

    // Music detection (highest priority)
    if (this.detectMusicContent(categoryId, title, description, tags)) {
      return {
        type: YouTubeContentType.MUSIC,
        processingPriority: 3,
        downloadStrategy: 'none',
        downloadQuality: 'audio-only',
        transcriptionStrategy: 'skip',
        summaryComplexity: 'basic',
        expectedProcessingTime: 5,
      };
    }

    // Shorts detection
    if (duration < 60 || title.includes('#shorts') || this.isVerticalVideo(apiData)) {
      return {
        type: YouTubeContentType.SHORT,
        processingPriority: 8,
        downloadStrategy: 'full',
        downloadQuality: '360p',
        transcriptionStrategy: 'whisper_full',
        summaryComplexity: 'basic',
        expectedProcessingTime: 20,
      };
    }

    // Educational content detection
    if (this.detectEducationalContent(title, description, tags, categoryId)) {
      const strategy = duration > 900 ? 'audio' : 'full';
      return {
        type: YouTubeContentType.EDUCATIONAL,
        processingPriority: 6,
        downloadStrategy: strategy,
        downloadQuality: strategy === 'audio' ? 'audio-only' : '720p',
        transcriptionStrategy: 'whisper_chunked',
        chunkingStrategy: {
          chunkSize: apiData.chapters?.length > 0 ? 0 : 300, // Use chapters if available
          overlap: 30,
          useChapters: true,
        },
        summaryComplexity: 'comprehensive',
        expectedProcessingTime: Math.min(duration * 0.8, 180), // Max 3 minutes
      };
    }

    // Long content (>10 minutes)
    if (duration > 600) {
      return {
        type: YouTubeContentType.LONG,
        processingPriority: 4,
        downloadStrategy: 'audio',
        downloadQuality: 'audio-only',
        transcriptionStrategy: 'whisper_chunked',
        chunkingStrategy: {
          chunkSize: 600,
          overlap: 60,
          useChapters: false,
        },
        summaryComplexity: 'standard',
        expectedProcessingTime: Math.min(duration * 0.6, 120), // Max 2 minutes
      };
    }

    // Standard content (default)
    return {
      type: YouTubeContentType.STANDARD,
      processingPriority: 5,
      downloadStrategy: 'full',
      downloadQuality: '720p',
      transcriptionStrategy: 'whisper_full',
      summaryComplexity: 'standard',
      expectedProcessingTime: 45,
    };
  }

  private detectMusicContent(
    categoryId: string,
    title: string,
    description: string,
    tags: string[],
  ): boolean {
    // YouTube Music category
    if (categoryId === '10') return true;

    // Music keywords in title/description
    const musicKeywords = ['official music video', 'lyrics', 'album', 'song', 'track', 'artist'];
    const textToSearch = `${title} ${description}`.toLowerCase();

    return (
      musicKeywords.some(keyword => textToSearch.includes(keyword)) ||
      tags.some(tag => tag.toLowerCase().includes('music'))
    );
  }

  private detectEducationalContent(
    title: string,
    description: string,
    tags: string[],
    categoryId: string,
  ): boolean {
    // Education category
    if (categoryId === '27') return true;

    // Educational keywords
    const eduKeywords = [
      'tutorial',
      'how to',
      'learn',
      'course',
      'lesson',
      'explained',
      'guide',
      'step by step',
      'walkthrough',
      'lecture',
      'class',
    ];

    const textToSearch = `${title} ${description}`.toLowerCase();

    return (
      eduKeywords.some(keyword => textToSearch.includes(keyword)) ||
      tags.some(tag => eduKeywords.some(edu => tag.toLowerCase().includes(edu)))
    );
  }
}
```

---

## 4 — Phase 1: Immediate YouTube API Fetch (1-2s)

### 4.1 YouTubeFetcher Implementation

```typescript
@Injectable()
export class YouTubeFetcher extends BaseContentFetcher {
  constructor(
    protected readonly configService: ConfigService,
    private readonly quotaManager: YouTubeQuotaManager,
    private readonly classifier: YouTubeContentClassifier,
    private readonly enhancementQueue: YouTubeEnhancementQueue,
  ) {
    super(Platform.YOUTUBE, configService);
  }

  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    const videoId = this.extractVideoId(request.url);
    this.logMetrics('fetch_start', { videoId });

    try {
      // 1. Check quota availability
      const quotaAvailable = await this.quotaManager.checkQuotaAvailable('videos.list');
      if (!quotaAvailable) {
        throw new FetcherError(
          'YouTube API quota exceeded',
          FetcherErrorCode.QUOTA_EXCEEDED,
          Platform.YOUTUBE,
        );
      }

      // 2. Fetch video data from YouTube API
      const apiData = await this.fetchYouTubeVideoData(videoId);

      // 3. Record quota usage
      await this.quotaManager.recordQuotaUsage('videos.list');

      // 4. Classify content for processing strategy
      const processingStrategy = this.classifier.classifyContent(apiData);

      // 5. Create quick embedding content
      const quickContent = this.createQuickEmbeddingContent(apiData, processingStrategy);

      // 6. Queue background enhancement
      await this.enhancementQueue.queueEnhancement({
        shareId: request.shareId,
        videoId,
        processingStrategy,
        apiData,
        priority: processingStrategy.processingPriority,
      });

      // 7. Return immediate response
      const response = this.createFetchResponse(apiData, processingStrategy, request.url);

      this.logMetrics('fetch_success', {
        videoId,
        contentType: processingStrategy.type,
        duration: apiData.contentDetails.duration,
      });

      return response;
    } catch (error) {
      this.logMetrics('fetch_error', { videoId, error: error.message });
      throw error;
    }
  }

  private async fetchYouTubeVideoData(videoId: string): Promise<YouTubeVideoData> {
    const apiKey = this.config.credentials?.apiKey;
    if (!apiKey) {
      throw new FetcherError(
        'YouTube API key not configured',
        FetcherErrorCode.API_UNAVAILABLE,
        Platform.YOUTUBE,
      );
    }

    const url = 'https://www.googleapis.com/youtube/v3/videos';
    const params = new URLSearchParams({
      id: videoId,
      part: 'snippet,contentDetails,statistics,status',
      key: apiKey,
    });

    const response = await this.fetchWithTimeout(`${url}?${params.toString()}`);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      throw new FetcherError(
        'Video not found or unavailable',
        FetcherErrorCode.CONTENT_NOT_FOUND,
        Platform.YOUTUBE,
      );
    }

    const video = data.items[0];

    // Check if video is private or restricted
    if (video.status.privacyStatus !== 'public') {
      throw new FetcherError(
        'Video is private or unlisted',
        FetcherErrorCode.CONTENT_PRIVATE,
        Platform.YOUTUBE,
      );
    }

    return video;
  }

  private createQuickEmbeddingContent(
    apiData: YouTubeVideoData,
    strategy: YouTubeProcessingStrategy,
  ): string {
    const { snippet, statistics } = apiData;

    // Create rich initial content for embedding
    const parts = [
      snippet.title,
      this.truncateDescription(snippet.description, 500),
      `By ${snippet.channelTitle}`,
      snippet.tags ? snippet.tags.slice(0, 10).join(', ') : '',
      `Duration: ${this.formatDuration(apiData.contentDetails.duration)}`,
      `Views: ${this.formatNumber(statistics.viewCount)}`,
      strategy.type.replace('youtube_', '').replace('_', ' '),
    ].filter(Boolean);

    return parts.join('. ');
  }

  private createFetchResponse(
    apiData: YouTubeVideoData,
    strategy: YouTubeProcessingStrategy,
    originalUrl: string,
  ): FetchResponse {
    const { snippet, contentDetails, statistics } = apiData;

    return {
      content: {
        text: snippet.title,
        description: this.truncateDescription(snippet.description, 1000),
      },
      media: {
        type: 'video',
        thumbnailUrl: this.selectBestThumbnail(snippet.thumbnails),
        duration: this.parseDuration(contentDetails.duration),
        originalUrl,
      },
      metadata: {
        author: snippet.channelTitle,
        publishedAt: new Date(snippet.publishedAt),
        platform: Platform.YOUTUBE,
        platformId: this.extractVideoId(originalUrl),
      },
      platformData: {
        ...apiData,
        processingStrategy: strategy,
        hasChapters: !!apiData.chapters?.length,
        contentType: strategy.type,
      },
      hints: {
        hasNativeCaptions: contentDetails.caption === 'true',
        language: snippet.defaultLanguage || snippet.defaultAudioLanguage || 'en',
        requiresAuth: false,
      },
    };
  }

  canHandle(url: string): boolean {
    const youtubePattern =
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    return youtubePattern.test(url);
  }

  private extractVideoId(url: string): string {
    const patterns = [
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
      /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    throw new FetcherError(
      'Invalid YouTube URL format',
      FetcherErrorCode.INVALID_URL,
      Platform.YOUTUBE,
    );
  }
}
```

---

## 5 — Phase 2: Background Enhancement Pipeline

### 5.1 Enhancement Queue System

```typescript
@Processor('youtube.enhance')
export class YouTubeEnhancementProcessor {
  constructor(
    private readonly downloadService: YouTubeDownloadService,
    private readonly transcriptionService: TranscriptionService,
    private readonly summaryService: SummaryService,
    private readonly embeddingService: EmbeddingService,
    private readonly shareService: ShareService,
  ) {}

  @Process('enhance-content')
  async enhanceYouTubeContent(job: Job<YouTubeEnhancementData>): Promise<void> {
    const { shareId, videoId, processingStrategy, apiData } = job.data;

    const tracer = trace.getTracer('youtube-enhancement');
    await tracer.startActiveSpan('youtube.enhancement.full', async span => {
      span.setAttributes({
        'youtube.video_id': videoId,
        'youtube.content_type': processingStrategy.type,
        'youtube.processing_priority': processingStrategy.processingPriority,
      });

      try {
        // Update status to enhancement started
        await this.shareService.updateEnhancementStatus(shareId, 'phase2_started');

        // Step 1: Caption Strategy Decision
        const captionData = await this.decideCaptionStrategy(videoId, processingStrategy, apiData);

        // Step 2: Smart Download (if needed)
        const mediaData = await this.smartDownload(videoId, processingStrategy);

        // Step 3: Transcription Processing
        const transcriptData = await this.processTranscription(
          mediaData,
          captionData,
          processingStrategy,
        );

        // Step 4: Chapter Extraction (if applicable)
        const chapterData = await this.extractChapters(apiData, transcriptData, processingStrategy);

        // Step 5: Enhanced Summarization
        const summaryData = await this.generateEnhancedSummary(
          transcriptData,
          apiData,
          processingStrategy,
        );

        // Step 6: Rich Embedding Generation
        const embeddingData = await this.generateRichEmbeddings(
          summaryData,
          transcriptData,
          chapterData,
          apiData,
        );

        // Step 7: Store Enhanced Data
        await this.storeEnhancedData(shareId, {
          transcriptData,
          chapterData,
          summaryData,
          embeddingData,
          processingStrategy,
        });

        // Step 8: Update Final Status
        await this.shareService.updateShareStatus(shareId, 'enriched');
        await this.shareService.updateEnhancementStatus(shareId, 'phase2_completed');

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });

        await this.shareService.updateShareStatus(shareId, 'enhancement_failed');
        await this.shareService.updateEnhancementStatus(shareId, 'failed', error.message);

        throw error;
      }
    });
  }

  private async decideCaptionStrategy(
    videoId: string,
    strategy: YouTubeProcessingStrategy,
    apiData: YouTubeVideoData,
  ): Promise<CaptionData | null> {
    // Skip for music content
    if (strategy.transcriptionStrategy === 'skip') {
      return null;
    }

    // For educational content or long videos, prefer Whisper for accuracy
    if (
      strategy.type === YouTubeContentType.EDUCATIONAL ||
      strategy.type === YouTubeContentType.LONG
    ) {
      return null; // Use Whisper instead
    }

    // For shorts and standard content, try API captions first
    if (apiData.contentDetails.caption === 'true') {
      try {
        const captions = await this.fetchYouTubeCaptions(videoId);
        if (captions && this.validateCaptionQuality(captions)) {
          return {
            source: 'youtube_api',
            text: captions,
            language: apiData.snippet.defaultLanguage || 'en',
            confidence: 0.85,
            timestamped: true,
          };
        }
      } catch (error) {
        this.logger.warn(`Failed to fetch API captions for ${videoId}:`, error);
      }
    }

    return null; // Fall back to Whisper
  }

  private async smartDownload(
    videoId: string,
    strategy: YouTubeProcessingStrategy,
  ): Promise<MediaData | null> {
    if (strategy.downloadStrategy === 'none') {
      return null;
    }

    const downloadOptions = {
      videoId,
      quality: strategy.downloadQuality,
      format: strategy.downloadQuality === 'audio-only' ? 'mp3' : 'mp4',
      maxFileSize: this.getMaxFileSize(strategy.type),
      maxDuration: this.getMaxDuration(strategy.type),
    };

    try {
      const downloadResult = await this.downloadService.downloadVideo(downloadOptions);

      return {
        filePath: downloadResult.filePath,
        fileSize: downloadResult.fileSize,
        format: downloadResult.format,
        quality: downloadResult.quality,
        duration: downloadResult.duration,
        downloadedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Download failed for ${videoId}:`, error);
      return null;
    }
  }

  private async processTranscription(
    mediaData: MediaData | null,
    captionData: CaptionData | null,
    strategy: YouTubeProcessingStrategy,
  ): Promise<TranscriptData | null> {
    // Use API captions if available and strategy allows
    if (captionData && strategy.transcriptionStrategy === 'api_captions') {
      return {
        source: 'youtube_api',
        text: captionData.text,
        segments: this.parseTimestampedCaptions(captionData.text),
        language: captionData.language,
        confidence: captionData.confidence,
      };
    }

    // Use Whisper for transcription
    if (mediaData && strategy.transcriptionStrategy !== 'skip') {
      const whisperOptions = {
        filePath: mediaData.filePath,
        language: 'auto',
        task: 'transcribe',
        chunking: strategy.chunkingStrategy,
      };

      try {
        const transcription = await this.transcriptionService.transcribeAudio(whisperOptions);

        return {
          source: 'whisper',
          text: transcription.text,
          segments: transcription.segments,
          language: transcription.language,
          confidence: transcription.confidence || 0.9,
        };
      } catch (error) {
        this.logger.error(`Transcription failed:`, error);
        return null;
      }
    }

    return null;
  }

  private getMaxFileSize(contentType: YouTubeContentType): number {
    const sizeLimits = {
      [YouTubeContentType.SHORT]: 50 * 1024 * 1024, // 50MB
      [YouTubeContentType.STANDARD]: 200 * 1024 * 1024, // 200MB
      [YouTubeContentType.LONG]: 100 * 1024 * 1024, // 100MB (audio only)
      [YouTubeContentType.EDUCATIONAL]: 300 * 1024 * 1024, // 300MB
      [YouTubeContentType.MUSIC]: 0, // No download
    };

    return sizeLimits[contentType] || 100 * 1024 * 1024;
  }
}
```

---

## 6 — YouTube API Quota Management

### 6.1 Quota Manager Implementation

```typescript
@Injectable()
export class YouTubeQuotaManager {
  private readonly DAILY_QUOTA = 10000;
  private readonly OPERATION_COSTS = {
    'videos.list': 1,
    'channels.list': 1,
    'search.list': 100,
    'captions.list': 50,
    'captions.download': 200,
    'commentThreads.list': 1,
  };

  constructor(
    private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  async checkQuotaAvailable(
    operation: keyof typeof this.OPERATION_COSTS,
    requestCount: number = 1,
  ): Promise<boolean> {
    const cost = this.OPERATION_COSTS[operation] * requestCount;
    const currentUsage = await this.getCurrentQuotaUsage();

    return currentUsage + cost <= this.DAILY_QUOTA;
  }

  async recordQuotaUsage(
    operation: keyof typeof this.OPERATION_COSTS,
    requestCount: number = 1,
  ): Promise<void> {
    const cost = this.OPERATION_COSTS[operation] * requestCount;
    const key = this.getQuotaKey();

    // Increment usage with expiration at next midnight PST
    const usage = await this.redis.incrby(key, cost);
    await this.redis.expireat(key, this.getNextMidnightPST());

    // Log quota usage for monitoring
    this.logger.log({
      event: 'quota_usage',
      operation,
      cost,
      currentUsage: usage,
      remainingQuota: this.DAILY_QUOTA - usage,
      utilizationPercentage: ((usage / this.DAILY_QUOTA) * 100).toFixed(2),
    });

    // Alert if approaching limit
    if (usage > this.DAILY_QUOTA * 0.8) {
      this.logger.warn(
        `YouTube quota usage at ${usage}/${this.DAILY_QUOTA} ` +
          `(${((usage / this.DAILY_QUOTA) * 100).toFixed(1)}%)`,
      );
    }

    // Throw error if quota exceeded
    if (usage > this.DAILY_QUOTA) {
      throw new FetcherError(
        'YouTube API quota exceeded for today',
        FetcherErrorCode.QUOTA_EXCEEDED,
        Platform.YOUTUBE,
      );
    }
  }

  async getCurrentQuotaUsage(): Promise<number> {
    const key = this.getQuotaKey();
    const usage = await this.redis.get(key);
    return parseInt(usage || '0', 10);
  }

  async getQuotaStatus(): Promise<YouTubeQuotaStatus> {
    const usage = await this.getCurrentQuotaUsage();
    const remaining = Math.max(0, this.DAILY_QUOTA - usage);

    return {
      used: usage,
      limit: this.DAILY_QUOTA,
      remaining,
      utilizationPercentage: (usage / this.DAILY_QUOTA) * 100,
      resetTime: this.getNextMidnightPST(),
      isNearLimit: usage > this.DAILY_QUOTA * 0.8,
      isOverLimit: usage > this.DAILY_QUOTA,
    };
  }

  async prioritizeRequest(
    operation: keyof typeof this.OPERATION_COSTS,
    priority: number,
  ): Promise<boolean> {
    const quotaStatus = await this.getQuotaStatus();

    // If quota is abundant, allow all requests
    if (quotaStatus.utilizationPercentage < 50) {
      return true;
    }

    // If quota is limited, only allow high-priority requests
    if (quotaStatus.utilizationPercentage > 80) {
      return priority >= 7; // Only high priority (7-10)
    }

    // Medium quota usage, allow medium+ priority
    return priority >= 5;
  }

  private getQuotaKey(): string {
    const today = new Date().toISOString().split('T')[0];
    return `youtube_quota:${today}`;
  }

  private getNextMidnightPST(): number {
    const now = new Date();
    const pstOffset = -8 * 60; // PST is UTC-8
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // Next midnight
    midnight.setMinutes(midnight.getMinutes() + pstOffset);
    return Math.floor(midnight.getTime() / 1000);
  }
}

interface YouTubeQuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  utilizationPercentage: number;
  resetTime: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}
```

---

## 7 — Database Schema Design

### 7.1 YouTube-Specific Tables

```sql
-- YouTube content metadata and processing status
CREATE TABLE youtube_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES shares(id) ON DELETE CASCADE,
  youtube_id VARCHAR(20) UNIQUE NOT NULL,

  -- Channel information
  channel_id VARCHAR(50),
  channel_title VARCHAR(255),

  -- Video metadata
  duration_seconds INTEGER,
  view_count BIGINT,
  like_count BIGINT,
  comment_count BIGINT,

  -- Content classification
  content_type VARCHAR(50) NOT NULL, -- youtube_short, youtube_standard, etc.
  processing_priority INTEGER DEFAULT 5,

  -- Availability flags
  has_captions BOOLEAN DEFAULT false,
  is_short BOOLEAN DEFAULT false,
  is_live BOOLEAN DEFAULT false,
  is_music BOOLEAN DEFAULT false,

  -- Content rating and restrictions
  content_rating VARCHAR(20),
  privacy_status VARCHAR(20),

  -- Publishing information
  published_at TIMESTAMPTZ,
  tags TEXT[],

  -- Processing strategy used
  download_strategy VARCHAR(20), -- full, audio, none
  transcription_strategy VARCHAR(30), -- api_captions, whisper_full, whisper_chunked, skip

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video chapters for timestamp-based search and navigation
CREATE TABLE youtube_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_content_id UUID REFERENCES youtube_content(id) ON DELETE CASCADE,
  share_id UUID REFERENCES shares(id) ON DELETE CASCADE,

  -- Chapter timing
  start_seconds INTEGER NOT NULL,
  end_seconds INTEGER,
  title VARCHAR(500),

  -- Chapter content
  summary TEXT,
  transcript_segment TEXT,
  key_points TEXT[],

  -- Search and embeddings
  embedding vector(1536),
  search_keywords TEXT[],

  -- Metadata
  chapter_order INTEGER,
  duration_seconds INTEGER GENERATED ALWAYS AS (end_seconds - start_seconds) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_chapter_timing CHECK (end_seconds > start_seconds OR end_seconds IS NULL)
);

-- YouTube enhancement processing status and tracking
CREATE TABLE youtube_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID REFERENCES shares(id) ON DELETE CASCADE,
  youtube_content_id UUID REFERENCES youtube_content(id) ON DELETE CASCADE,

  -- Phase tracking
  phase1_completed_at TIMESTAMPTZ,      -- API fetch completed
  phase2_started_at TIMESTAMPTZ,        -- Background processing started
  phase2_completed_at TIMESTAMPTZ,      -- Background processing completed

  -- Individual step status
  download_status VARCHAR(50) DEFAULT 'pending',     -- pending, completed, failed, skipped
  download_file_path TEXT,
  download_file_size BIGINT,

  transcription_status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed, skipped
  transcription_source VARCHAR(20),                   -- youtube_api, whisper
  transcription_language VARCHAR(10),
  transcription_confidence DECIMAL(4,3),

  summary_status VARCHAR(50) DEFAULT 'pending',       -- pending, completed, failed
  summary_length INTEGER,
  summary_complexity VARCHAR(20),

  embedding_status VARCHAR(50) DEFAULT 'pending',     -- pending, completed, failed
  embeddings_count INTEGER DEFAULT 0,
  chapters_count INTEGER DEFAULT 0,

  -- Error tracking
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMPTZ,

  -- Performance tracking
  total_processing_time_seconds INTEGER,
  download_time_seconds INTEGER,
  transcription_time_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- YouTube API quota usage tracking
CREATE TABLE youtube_quota_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Operation breakdown
  videos_list_calls INTEGER DEFAULT 0,
  captions_list_calls INTEGER DEFAULT 0,
  captions_download_calls INTEGER DEFAULT 0,
  channels_list_calls INTEGER DEFAULT 0,
  search_list_calls INTEGER DEFAULT 0,

  -- Total quota consumption
  total_quota_used INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 10000,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(date)
);
```

### 7.2 Performance Indexes

```sql
-- Primary lookup indexes
CREATE INDEX idx_youtube_content_share_id ON youtube_content(share_id);
CREATE INDEX idx_youtube_content_youtube_id ON youtube_content(youtube_id);
CREATE INDEX idx_youtube_content_channel ON youtube_content(channel_id);

-- Content classification indexes
CREATE INDEX idx_youtube_content_type ON youtube_content(content_type);
CREATE INDEX idx_youtube_content_priority ON youtube_content(processing_priority DESC);
CREATE INDEX idx_youtube_content_published ON youtube_content(published_at DESC);

-- Chapter search indexes
CREATE INDEX idx_youtube_chapters_share ON youtube_chapters(share_id);
CREATE INDEX idx_youtube_chapters_content ON youtube_chapters(youtube_content_id);
CREATE INDEX idx_youtube_chapters_timing ON youtube_chapters(start_seconds, end_seconds);
CREATE INDEX idx_youtube_chapters_embedding ON youtube_chapters USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enhancement status indexes
CREATE INDEX idx_youtube_enhancements_share ON youtube_enhancements(share_id);
CREATE INDEX idx_youtube_enhancements_pending ON youtube_enhancements(phase2_started_at)
  WHERE phase2_completed_at IS NULL AND phase2_started_at IS NOT NULL;
CREATE INDEX idx_youtube_enhancements_failed ON youtube_enhancements(download_status, transcription_status, summary_status)
  WHERE download_status = 'failed' OR transcription_status = 'failed' OR summary_status = 'failed';

-- Quota tracking indexes
CREATE INDEX idx_youtube_quota_date ON youtube_quota_usage(date DESC);

-- Composite indexes for common queries
CREATE INDEX idx_youtube_content_type_priority ON youtube_content(content_type, processing_priority DESC);
CREATE INDEX idx_youtube_chapters_timing_order ON youtube_chapters(youtube_content_id, start_seconds, chapter_order);
```

---

## 8 — Error Handling & Resilience

### 8.1 YouTube-Specific Error Types

```typescript
export enum YouTubeErrorCode {
  QUOTA_EXCEEDED = 'YOUTUBE_QUOTA_EXCEEDED',
  VIDEO_NOT_FOUND = 'YOUTUBE_VIDEO_NOT_FOUND',
  VIDEO_PRIVATE = 'YOUTUBE_VIDEO_PRIVATE',
  VIDEO_RESTRICTED = 'YOUTUBE_VIDEO_RESTRICTED',
  INVALID_VIDEO_ID = 'YOUTUBE_INVALID_VIDEO_ID',
  API_KEY_INVALID = 'YOUTUBE_API_KEY_INVALID',
  DOWNLOAD_FAILED = 'YOUTUBE_DOWNLOAD_FAILED',
  TRANSCRIPTION_FAILED = 'YOUTUBE_TRANSCRIPTION_FAILED',
  CAPTIONS_UNAVAILABLE = 'YOUTUBE_CAPTIONS_UNAVAILABLE',
}

export class YouTubeError extends FetcherError {
  constructor(
    message: string,
    code: YouTubeErrorCode,
    public readonly videoId?: string,
    public readonly quotaUsed?: number,
    cause?: Error,
  ) {
    super(message, code as FetcherErrorCode, Platform.YOUTUBE, cause);
  }
}
```

### 8.2 Retry and Backoff Strategy

```typescript
@Injectable()
export class YouTubeResilienceManager {
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 1000; // 1 second

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: {
      videoId: string;
      operationType: string;
      retryable?: boolean;
    },
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry non-retryable errors
        if (!this.isRetryableError(error) || !context.retryable) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === this.MAX_RETRIES) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);

        this.logger.warn(
          `YouTube operation failed (attempt ${attempt}/${this.MAX_RETRIES}), ` +
            `retrying in ${delay}ms`,
          {
            videoId: context.videoId,
            operationType: context.operationType,
            error: error.message,
            attempt,
          },
        );

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: Error): boolean {
    if (error instanceof YouTubeError) {
      const nonRetryableCodes = [
        YouTubeErrorCode.VIDEO_NOT_FOUND,
        YouTubeErrorCode.VIDEO_PRIVATE,
        YouTubeErrorCode.VIDEO_RESTRICTED,
        YouTubeErrorCode.INVALID_VIDEO_ID,
        YouTubeErrorCode.API_KEY_INVALID,
        YouTubeErrorCode.QUOTA_EXCEEDED,
      ];

      return !nonRetryableCodes.includes(error.code as YouTubeErrorCode);
    }

    // Retry network errors and temporary failures
    return error instanceof RetryableFetcherError;
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s with jitter
    const exponentialDelay = this.BASE_DELAY * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay; // ±30% jitter
    return Math.floor(exponentialDelay + jitter);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

## 9 — Monitoring & Performance Metrics

### 9.1 YouTube-Specific Metrics

```typescript
interface YouTubeMetrics {
  // API and quota metrics
  'youtube.api.quota.used': Gauge;
  'youtube.api.quota.remaining': Gauge;
  'youtube.api.quota.utilization_percentage': Gauge;
  'youtube.api.requests.total': Counter<'operation' | 'status'>;
  'youtube.api.requests.duration': Histogram<'operation'>;

  // Content classification metrics
  'youtube.classification.total': Counter<'content_type'>;
  'youtube.classification.duration': Histogram;

  // Processing pipeline metrics
  'youtube.phase1.duration': Histogram;
  'youtube.phase2.duration': Histogram<'content_type'>;
  'youtube.enhancement.queue.size': Gauge;
  'youtube.enhancement.queue.processing_time': Histogram<'content_type'>;

  // Download metrics
  'youtube.download.total': Counter<'strategy' | 'quality' | 'status'>;
  'youtube.download.duration': Histogram<'strategy' | 'quality'>;
  'youtube.download.file_size': Histogram<'strategy' | 'quality'>;

  // Transcription metrics
  'youtube.transcription.total': Counter<'source' | 'status'>;
  'youtube.transcription.duration': Histogram<'source'>;
  'youtube.transcription.confidence': Histogram<'source'>;

  // Chapter extraction metrics
  'youtube.chapters.extracted': Counter;
  'youtube.chapters.per_video': Histogram;

  // Error metrics
  'youtube.errors.total': Counter<'error_code' | 'operation'>;
  'youtube.quota.exceeded.total': Counter;
}
```

### 9.2 Performance Monitoring Implementation

```typescript
@Injectable()
export class YouTubeMetricsCollector {
  constructor(private readonly metricsService: MetricsService) {}

  recordApiCall(operation: string, duration: number, status: 'success' | 'error'): void {
    this.metricsService.incrementCounter('youtube.api.requests.total', 1, {
      operation,
      status,
    });

    this.metricsService.recordHistogram('youtube.api.requests.duration', duration, {
      operation,
    });
  }

  recordQuotaUsage(used: number, limit: number): void {
    this.metricsService.setGauge('youtube.api.quota.used', used);
    this.metricsService.setGauge('youtube.api.quota.remaining', limit - used);
    this.metricsService.setGauge('youtube.api.quota.utilization_percentage', (used / limit) * 100);
  }

  recordContentClassification(contentType: string, duration: number): void {
    this.metricsService.incrementCounter('youtube.classification.total', 1, {
      content_type: contentType,
    });

    this.metricsService.recordHistogram('youtube.classification.duration', duration);
  }

  recordPhase1Processing(duration: number): void {
    this.metricsService.recordHistogram('youtube.phase1.duration', duration);
  }

  recordPhase2Processing(contentType: string, duration: number): void {
    this.metricsService.recordHistogram('youtube.phase2.duration', duration, {
      content_type: contentType,
    });
  }

  recordDownload(
    strategy: string,
    quality: string,
    status: 'success' | 'failed',
    duration: number,
    fileSize?: number,
  ): void {
    this.metricsService.incrementCounter('youtube.download.total', 1, {
      strategy,
      quality,
      status,
    });

    this.metricsService.recordHistogram('youtube.download.duration', duration, {
      strategy,
      quality,
    });

    if (fileSize && status === 'success') {
      this.metricsService.recordHistogram('youtube.download.file_size', fileSize, {
        strategy,
        quality,
      });
    }
  }

  recordTranscription(
    source: 'youtube_api' | 'whisper',
    status: 'success' | 'failed',
    duration: number,
    confidence?: number,
  ): void {
    this.metricsService.incrementCounter('youtube.transcription.total', 1, {
      source,
      status,
    });

    this.metricsService.recordHistogram('youtube.transcription.duration', duration, {
      source,
    });

    if (confidence && status === 'success') {
      this.metricsService.recordHistogram('youtube.transcription.confidence', confidence, {
        source,
      });
    }
  }

  recordChapterExtraction(chapterCount: number): void {
    this.metricsService.incrementCounter('youtube.chapters.extracted', chapterCount);
    this.metricsService.recordHistogram('youtube.chapters.per_video', chapterCount);
  }

  recordError(errorCode: string, operation: string): void {
    this.metricsService.incrementCounter('youtube.errors.total', 1, {
      error_code: errorCode,
      operation,
    });
  }
}
```

---

## 10 — Testing Strategy

### 10.1 Unit Testing Approach

```typescript
describe('YouTubeFetcher', () => {
  let fetcher: YouTubeFetcher;
  let quotaManager: jest.Mocked<YouTubeQuotaManager>;
  let classifier: jest.Mocked<YouTubeContentClassifier>;

  beforeEach(() => {
    // Setup mocks
  });

  describe('Content Classification', () => {
    it('should classify YouTube Shorts correctly', async () => {
      const mockApiData = loadFixture('youtube-short-response.json');
      const classification = classifier.classifyContent(mockApiData);

      expect(classification.type).toBe(YouTubeContentType.SHORT);
      expect(classification.processingPriority).toBe(8);
      expect(classification.downloadStrategy).toBe('full');
      expect(classification.expectedProcessingTime).toBe(20);
    });

    it('should detect educational content', async () => {
      const mockApiData = loadFixture('youtube-tutorial-response.json');
      const classification = classifier.classifyContent(mockApiData);

      expect(classification.type).toBe(YouTubeContentType.EDUCATIONAL);
      expect(classification.transcriptionStrategy).toBe('whisper_chunked');
      expect(classification.summaryComplexity).toBe('comprehensive');
    });

    it('should handle music content appropriately', async () => {
      const mockApiData = loadFixture('youtube-music-response.json');
      const classification = classifier.classifyContent(mockApiData);

      expect(classification.type).toBe(YouTubeContentType.MUSIC);
      expect(classification.downloadStrategy).toBe('none');
      expect(classification.transcriptionStrategy).toBe('skip');
    });

    it('should classify long content for audio-only processing', async () => {
      const mockApiData = loadFixture('youtube-long-response.json');
      const classification = classifier.classifyContent(mockApiData);

      expect(classification.type).toBe(YouTubeContentType.LONG);
      expect(classification.downloadStrategy).toBe('audio');
      expect(classification.downloadQuality).toBe('audio-only');
    });
  });

  describe('API Integration', () => {
    it('should respect quota limits', async () => {
      quotaManager.checkQuotaAvailable.mockResolvedValue(false);

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          code: YouTubeErrorCode.QUOTA_EXCEEDED,
        }),
      );
    });

    it('should handle video not found', async () => {
      nock('https://www.googleapis.com')
        .get('/youtube/v3/videos')
        .query(true)
        .reply(200, { items: [] });

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          code: YouTubeErrorCode.VIDEO_NOT_FOUND,
        }),
      );
    });

    it('should handle private videos', async () => {
      const mockResponse = loadFixture('youtube-private-response.json');
      nock('https://www.googleapis.com')
        .get('/youtube/v3/videos')
        .query(true)
        .reply(200, mockResponse);

      await expect(fetcher.fetchContent(mockRequest)).rejects.toThrow(
        expect.objectContaining({
          code: YouTubeErrorCode.VIDEO_PRIVATE,
        }),
      );
    });

    it('should record quota usage after successful API call', async () => {
      const mockResponse = loadFixture('youtube-success-response.json');
      nock('https://www.googleapis.com')
        .get('/youtube/v3/videos')
        .query(true)
        .reply(200, mockResponse);

      quotaManager.checkQuotaAvailable.mockResolvedValue(true);

      await fetcher.fetchContent(mockRequest);

      expect(quotaManager.recordQuotaUsage).toHaveBeenCalledWith('videos.list', 1);
    });
  });

  describe('URL Validation', () => {
    test.each([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/v/dQw4w9WgXcQ',
    ])('should handle valid YouTube URL: %s', url => {
      expect(fetcher.canHandle(url)).toBe(true);
      expect(fetcher['extractVideoId'](url)).toBe('dQw4w9WgXcQ');
    });

    test.each([
      'https://vimeo.com/123456',
      'https://example.com/video',
      'invalid-url',
      'https://youtube.com/playlist?list=abc',
    ])('should reject invalid YouTube URL: %s', url => {
      expect(fetcher.canHandle(url)).toBe(false);
    });
  });
});
```

### 10.2 Integration Testing

```typescript
describe('YouTube Enhancement Pipeline Integration', () => {
  let enhancementProcessor: YouTubeEnhancementProcessor;
  let testQueue: Queue;

  beforeEach(async () => {
    // Setup test environment with real queue and services
  });

  it('should process a short video end-to-end', async () => {
    const jobData: YouTubeEnhancementData = {
      shareId: 'test-share-id',
      videoId: 'dQw4w9WgXcQ',
      processingStrategy: {
        type: YouTubeContentType.SHORT,
        processingPriority: 8,
        downloadStrategy: 'full',
        downloadQuality: '360p',
        transcriptionStrategy: 'whisper_full',
        summaryComplexity: 'basic',
        expectedProcessingTime: 20,
      },
      apiData: loadFixture('youtube-short-response.json'),
    };

    const job = await testQueue.add('enhance-content', jobData);
    await job.finished();

    // Verify enhancement completed
    const enhancementRecord = await db.youtubeEnhancements.findOne({
      shareId: jobData.shareId,
    });

    expect(enhancementRecord.phase2_completed_at).toBeTruthy();
    expect(enhancementRecord.download_status).toBe('completed');
    expect(enhancementRecord.transcription_status).toBe('completed');
    expect(enhancementRecord.summary_status).toBe('completed');
  });

  it('should handle educational content with chapters', async () => {
    const jobData: YouTubeEnhancementData = {
      shareId: 'test-educational-share',
      videoId: 'educational-video-id',
      processingStrategy: {
        type: YouTubeContentType.EDUCATIONAL,
        processingPriority: 6,
        downloadStrategy: 'full',
        downloadQuality: '720p',
        transcriptionStrategy: 'whisper_chunked',
        chunkingStrategy: {
          chunkSize: 0, // Use chapters
          overlap: 30,
          useChapters: true,
        },
        summaryComplexity: 'comprehensive',
        expectedProcessingTime: 120,
      },
      apiData: loadFixture('youtube-educational-with-chapters.json'),
    };

    const job = await testQueue.add('enhance-content', jobData);
    await job.finished();

    // Verify chapters were extracted
    const chapters = await db.youtubeChapters.findMany({
      shareId: jobData.shareId,
    });

    expect(chapters.length).toBeGreaterThan(0);
    expect(chapters[0].embedding).toBeTruthy();
    expect(chapters[0].transcript_segment).toBeTruthy();
  });
});
```

---

## 11 — Performance Targets & SLAs

### 11.1 Performance Benchmarks

| Metric                         | Target                    | Measurement Method                      |
| ------------------------------ | ------------------------- | --------------------------------------- |
| **Phase 1 Response Time**      | < 2 seconds               | API fetch + classification + queue      |
| **Short Video Enhancement**    | < 30 seconds              | Full pipeline for <60s videos           |
| **Standard Video Enhancement** | < 90 seconds              | Full pipeline for 1-10min videos        |
| **Long Video Enhancement**     | < 3 minutes               | Audio-only pipeline for 10+ min videos  |
| **API Quota Efficiency**       | > 90% successful fetches  | Ratio of successful to failed API calls |
| **Transcription Accuracy**     | > 90% for English content | WER (Word Error Rate) measurement       |
| **Chapter Extraction Success** | > 95% when available      | Successful chapter parsing rate         |

### 11.2 Resource Utilization Targets

```typescript
interface YouTubeResourceTargets {
  storage: {
    maxFileSizePerVideo: number; // 300MB for educational, 50MB for shorts
    maxTotalStoragePerDay: number; // 10GB daily limit
    compressionRatio: number; // Target 70% compression for downloads
  };

  processing: {
    maxConcurrentDownloads: number; // 5 concurrent downloads
    maxConcurrentTranscriptions: number; // 3 concurrent Whisper jobs
    queueProcessingRate: number; // 50 videos/hour target
  };

  api: {
    quotaUtilizationTarget: number; // 80% of daily quota
    averageQuotaPerVideo: number; // 1.2 quota units per video (including retries)
    peakHourlyUsage: number; // Max 500 quota units/hour
  };
}
```

---

## 12 — Future Enhancements

### 12.1 Advanced YouTube Features

```typescript
// Phase 2 enhancements (future scope)
interface YouTubeFutureFeatures {
  // Comment mining for additional context
  commentAnalysis: {
    extractTimestamps: boolean; // Extract user-contributed timestamps
    identifyCorrections: boolean; // Find corrections to auto-captions
    summarizeInsights: boolean; // Summarize community highlights
  };

  // Channel intelligence
  channelLearning: {
    trackCreatorPatterns: boolean; // Learn creator-specific terminology
    predictContentQuality: boolean; // Score quality based on channel history
    optimizeProcessingStrategy: boolean; // Adjust strategy per creator
  };

  // Visual analysis
  visualProcessing: {
    extractKeyframes: boolean; // Extract frames at chapter boundaries
    detectSlides: boolean; // Identify presentation slides
    ocrEnabled: boolean; // Extract text from video frames
  };

  // Advanced search
  semanticSearch: {
    timestampNavigation: boolean; // "Show me where they explain X"
    conceptLinking: boolean; // Link related concepts across videos
    multimodalEmbeddings: boolean; // Combine audio, visual, and text
  };
}
```

### 12.2 Integration with ML Pipeline (Phase 3)

```typescript
// Integration points for future ML enhancements
interface YouTubeMLIntegration {
  // Enhanced transcription
  transcriptionEnhancement: {
    speakerDiarization: boolean; // Identify different speakers
    emotionDetection: boolean; // Detect emotional content
    keywordExtraction: boolean; // Extract technical terms
  };

  // Content understanding
  contentAnalysis: {
    topicModeling: boolean; // Identify main topics
    sentimentAnalysis: boolean; // Analyze sentiment over time
    actionItemExtraction: boolean; // Extract actionable insights
  };

  // Personalization
  userAdaptation: {
    personalizedSummaries: boolean; // Adapt summaries to user interests
    learningPathSuggestions: boolean; // Suggest related content
    difficultyAssessment: boolean; // Assess content difficulty
  };
}
```

---

## 13 — Migration Plan & Implementation Timeline

### 13.1 Phase 1: Foundation (Week 1)

- [ ] **Day 1-2**: YouTube fetcher base implementation
  - Implement `YouTubeFetcher` class extending `BaseContentFetcher`
  - Create `YouTubeContentClassifier` with content type detection
  - Set up YouTube API integration with error handling
- [ ] **Day 3-4**: Quota management system
  - Implement `YouTubeQuotaManager` with Redis backing
  - Create quota monitoring and alerting
  - Add prioritization logic for quota-constrained scenarios
- [ ] **Day 5-7**: Database schema and basic processing
  - Create YouTube-specific database tables
  - Implement Phase 1 processing (immediate response)
  - Set up basic monitoring and metrics collection

### 13.2 Phase 2: Enhancement Pipeline (Week 2)

- [ ] **Day 1-3**: Background processing infrastructure
  - Implement `YouTubeEnhancementProcessor` with BullMQ
  - Create download service with quality selection
  - Set up transcription service integration
- [ ] **Day 4-5**: Chapter extraction and search
  - Implement chapter parsing and storage
  - Create chapter-based embedding generation
  - Add timestamp-based search capabilities
- [ ] **Day 6-7**: Testing and validation
  - Comprehensive unit test suite
  - Integration testing with real YouTube content
  - Performance benchmarking and optimization

### 13.3 Phase 3: Production Readiness (Week 3)

- [ ] **Day 1-2**: Error handling and resilience
  - Implement retry mechanisms and circuit breakers
  - Add comprehensive error tracking and alerting
  - Create graceful degradation strategies
- [ ] **Day 3-4**: Monitoring and observability
  - Deploy Grafana dashboards for YouTube metrics
  - Set up alerting for quota usage and errors
  - Implement distributed tracing for enhancement pipeline
- [ ] **Day 5-7**: Security and performance review
  - Security audit of API key handling
  - Performance optimization based on benchmarks
  - Load testing with concurrent processing

### 13.4 Phase 4: Rollout and Optimization (Week 4)

- [ ] **Day 1-2**: Staging deployment and validation
  - Deploy to staging environment
  - End-to-end testing with real user scenarios
  - Validation of all performance targets
- [ ] **Day 3-4**: Production deployment
  - Gradual rollout with feature flags
  - Monitor quota usage and processing performance
  - Collect user feedback on search quality
- [ ] **Day 5-7**: Optimization and documentation
  - Performance tuning based on production metrics
  - Complete technical documentation
  - Knowledge transfer and operational runbooks

---

## 14 — Consequences

### Positive

- **Rich Content Support**: Comprehensive YouTube metadata extraction with intelligent processing
- **Fast User Experience**: Sub-2-second response time for immediate searchability
- **Scalable Processing**: Two-phase model manages resource usage effectively
- **Cost Optimization**: Smart quota management and content-aware processing strategies
- **Enhanced Search**: Chapter-based navigation and timestamp search capabilities
- **Quality Assurance**: Hybrid transcription approach optimizes accuracy vs cost
- **Future-Proof**: Extensible architecture for advanced ML features
- **Observability**: Comprehensive monitoring of quota, performance, and quality metrics

### Negative

- **Implementation Complexity**: Multi-phase processing increases system complexity
- **API Dependency**: Heavy reliance on YouTube Data API and quota constraints
- **Storage Requirements**: Video downloads and metadata increase storage needs
- **Processing Variability**: Enhancement times vary significantly by content type
- **Quota Risk**: Daily API limits may impact high-volume usage patterns
- **Quality Variance**: Transcription accuracy depends on audio quality and language

### Mitigations

- **Graceful Degradation**: Fallback to basic metadata when quota exhausted
- **Intelligent Prioritization**: High-value content gets priority processing
- **Storage Management**: Automatic cleanup of processed files after embedding
- **Quota Monitoring**: Real-time tracking with proactive throttling
- **Quality Assurance**: Confidence scoring and manual review flags
- **Performance Optimization**: Content-type-specific processing strategies

---

## 15 — References

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
