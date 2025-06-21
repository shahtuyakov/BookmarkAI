# ADR-021: Content Fetcher Interface Architecture for Multi-Platform Support

* **Status**: Proposed  
* **Date**: 2025-06-21  
* **Authors**: @bookmarkai-backend  
* **Supersedes**: —  
* **Superseded by**: —  
* **Related**: ADR-005 (BullMQ Worker), ADR-004 (Shares Endpoint), ADR-012 (API Style Guide)

---

## 1 — Context

Phase 2 of BookmarkAI requires fetching metadata and user-generated content from various social media platforms. Currently, the BullMQ worker (implemented in Task 1.5) only logs URLs and updates share status to "done" without actually fetching any content. The worker includes a placeholder `processPlatformContent()` method that was designed for future extension.

**Current State:**
- Share creation works with platform detection (TikTok, Reddit, Twitter/X)
- Worker processes jobs but doesn't fetch actual content
- No standardized way to handle different platform APIs/scraping methods
- Need to support both current platforms and future additions (YouTube, Instagram)
- Must handle rate limits, authentication, and platform-specific quirks

**Phase 2 Requirements:**
- Task 2.2: TikTok fetcher using oEmbed API
- Task 2.3: Reddit fetcher using JSON endpoints
- Task 2.4: Twitter/X stub implementation
- Task 2.14: Generic OpenGraph fallback
- Task 2.15: Future YouTube & Instagram support

---

## 2 — Decision

We will implement a **Strategy Pattern with Plugin Architecture** for content fetching.

### 2.1 High-Level Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   BullMQ    │────▶│   Share     │────▶│   Fetcher    │────▶│  External   │
│   Worker    │     │  Processor  │     │   Registry   │     │    APIs     │
└─────────────┘     └─────────────┘     └──────────────┘     └─────────────┘
                            │                     │
                            ▼                     ▼
                    ┌─────────────┐     ┌──────────────┐
                    │  Platform   │     │  Platform    │
                    │  Detection  │     │  Fetchers    │
                    └─────────────┘     └──────────────┘
```

### 2.2 Key Design Decisions

| Concern | Decision | Rationale |
|---------|----------|-----------|
| **Pattern** | Strategy Pattern with Registry | Enables runtime plugin architecture, follows Open/Closed principle |
| **Fetcher Selection** | Registry maps Platform enum to fetcher | Platform already detected at share creation (Task 1.4) |
| **Error Handling** | Retryable vs Permanent errors | Aligns with BullMQ retry mechanisms (ADR-005) |
| **Rate Limiting** | Per-platform limits in job options | Simple implementation, prevents API bans |
| **Authentication** | Fetcher-specific via config | Each platform has unique auth needs |
| **Media Handling** | Return URLs only, no downloads | Separation of concerns (Task 2.7 handles downloads) |
| **Timeout** | 10s default (within 30s worker limit) | Prevents job timeouts while allowing retries |
| **Testing** | Fixtures and mocks (Task 2.12) | Reliable CI without external dependencies |

### 2.3 Core Interfaces

```typescript
// Primary interface all fetchers must implement
export interface ContentFetcherInterface {
  fetchContent(request: FetchRequest): Promise<FetchResponse>;
  canHandle(url: string): boolean;
  getPlatform(): Platform;
}

// Request structure
export interface FetchRequest {
  url: string;
  shareId: string;
  userId: string;
  options?: FetchOptions;
}

// Standardized response format
export interface FetchResponse {
  content: {
    text?: string;         // Caption, title, or main text
    description?: string;  // Secondary text if available
  };
  
  media?: {
    type: 'video' | 'image' | 'audio' | 'none';
    url?: string;          // For Task 2.7 to download
    thumbnailUrl?: string;
    duration?: number;
  };
  
  metadata: {
    author?: string;
    publishedAt?: Date;
    platform: Platform;
    platformId?: string;
  };
  
  platformData?: Record<string, unknown>;  // Raw data for JSONB storage
  
  hints?: {
    hasNativeCaptions?: boolean;  // For Phase 3 ML pipeline
    language?: string;
    requiresAuth?: boolean;
  };
}
```

### 2.4 Error Handling Strategy

Following ADR-012's error taxonomy:

```typescript
// Permanent failures (no retry)
- CONTENT_NOT_FOUND (404)
- CONTENT_PRIVATE
- INVALID_URL
- PLATFORM_NOT_IMPLEMENTED (e.g., Twitter stub)

// Temporary failures (retry with backoff)
- RATE_LIMIT_EXCEEDED (429)
- API_UNAVAILABLE (5xx)
- NETWORK_ERROR
- TIMEOUT
```

### 2.5 Authentication & Configuration

```typescript
interface FetcherConfig {
  userAgent?: string;
  defaultTimeout?: number;
  credentials?: {
    apiKey?: string;        // YouTube, etc.
    oauth?: OAuthConfig;    // Instagram
    cookies?: Record<string, string>;  // TikTok if needed
  };
  enabledPlatforms?: Platform[];  // For compliance control
}
```

Credentials retrieved from Vault (Task 0.9) and injected via environment variables.

---

## 3 — Implementation Strategy

### 3.1 Platform Support Matrix

| Platform | Method | Auth Required | Data Available | Implementation Priority |
|----------|--------|---------------|----------------|------------------------|
| **TikTok** | oEmbed API | No | Caption, thumbnail, author | High (Task 2.2) |
| **Reddit** | JSON endpoint | No | Title, text, media URLs | High (Task 2.3) |
| **Twitter/X** | Stub only | — | Error response | Low (Task 2.4) |
| **Generic** | OpenGraph | No | Title, description, image | Medium (Task 2.14) |
| **YouTube** | Data API v3 | API Key | Full metadata | Future (Task 2.15) |
| **Instagram** | Graph API | OAuth | Caption, media, author | Future (Task 2.15) |

### 3.2 Registry Implementation

```typescript
@Injectable()
export class ContentFetcherRegistry {
  private readonly fetchers = new Map<Platform, ContentFetcherInterface>();
  private readonly enabledPlatforms: Set<Platform>;
  
  constructor(
    @Inject('FETCHERS') fetchers: ContentFetcherInterface[],
    private readonly config: ConfigService
  ) {
    // Register all fetchers
    fetchers.forEach(f => this.register(f));
    
    // Load enabled platforms for compliance
    this.enabledPlatforms = new Set(
      config.get('ENABLED_PLATFORMS', ['tiktok', 'reddit', 'generic'])
    );
  }
  
  getFetcher(platform: Platform): ContentFetcherInterface {
    // Check if platform is enabled (compliance)
    if (!this.enabledPlatforms.has(platform)) {
      throw new FetcherError('Platform disabled', 'PLATFORM_DISABLED', platform);
    }
    
    const fetcher = this.fetchers.get(platform);
    if (!fetcher) {
      // Fallback to generic OpenGraph fetcher
      return this.fetchers.get(Platform.GENERIC)!;
    }
    
    return fetcher;
  }
}
```

### 3.3 Integration with ShareProcessor

```typescript
@Processor('share.process')
export class ShareProcessor {
  async processShare(job: Job<ShareJobData>): Promise<void> {
    const { shareId } = job.data;
    
    // 1. Get share with pre-detected platform
    const share = await this.getShare(shareId);
    
    // 2. Update status
    await this.updateShareStatus(shareId, 'fetching');
    
    // 3. Fetch content
    const fetcher = this.fetcherRegistry.getFetcher(share.platform);
    const fetchResult = await fetcher.fetchContent({
      url: share.url,
      shareId: share.id,
      userId: share.userId
    });
    
    // 4. Store metadata (Task 2.8 implements this)
    await this.storeMetadata(shareId, fetchResult);
    
    // 5. Queue media download if needed (Task 2.7)
    if (fetchResult.media?.url) {
      await this.queueMediaDownload(shareId, fetchResult.media);
    }
    
    // 6. Update status (Phase 3 will change this flow)
    await this.updateShareStatus(shareId, 'done');
  }
}
```

### 3.4 Rate Limiting Configuration

```typescript
// BullMQ job options per platform
const RATE_LIMITS = {
  [Platform.TIKTOK]: { max: 60, duration: 60000 },    // 60/min
  [Platform.REDDIT]: { max: 60, duration: 60000 },    // 60/min
  [Platform.GENERIC]: { max: 120, duration: 60000 },  // 120/min
  [Platform.YOUTUBE]: { max: 10000, duration: 86400000 }, // 10k/day
};
```

---

## 4 — Testing Strategy

### 4.1 Unit Testing

```typescript
describe('ContentFetcher', () => {
  it('should fetch TikTok content from fixture', async () => {
    // Use recorded response from Task 2.12
    const mockResponse = loadFixture('tiktok-oembed-response.json');
    nock('https://www.tiktok.com')
      .get('/oembed')
      .reply(200, mockResponse);
    
    const result = await tiktokFetcher.fetchContent({
      url: 'https://www.tiktok.com/@user/video/123'
    });
    
    expect(result.content.text).toBe(mockResponse.title);
  });
});
```

### 4.2 Integration Testing

- Test full pipeline: share → worker → fetcher → storage
- Verify rate limit handling (simulate 429 responses)
- Test error scenarios and retry behavior
- Validate timeout handling within worker limits

### 4.3 Compliance Testing

- Verify only necessary metadata is collected
- Ensure platform-specific data stays in `platformData` field
- Test feature flag disabling of platforms

---

## 5 — Platform Implementations

### 5.1 TikTok Fetcher (Task 2.2)

```typescript
class TikTokFetcher extends BaseContentFetcher {
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    // Use oEmbed - no auth required, limited but reliable
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(request.url)}`;
    const response = await this.fetchWithTimeout(oembedUrl, {}, 5000);
    
    if (response.status === 429) {
      throw new RetryableFetcherError('Rate limited', 'RATE_LIMIT_EXCEEDED', Platform.TIKTOK, 60);
    }
    
    const data = await response.json();
    return {
      content: { text: data.title },  // Caption is in title
      media: { type: 'video', thumbnailUrl: data.thumbnail_url },
      metadata: { author: data.author_name, platform: Platform.TIKTOK },
      platformData: data,
      hints: { hasNativeCaptions: true }
    };
  }
}
```

### 5.2 Twitter/X Stub (Task 2.4)

```typescript
class TwitterFetcher extends BaseContentFetcher {
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    // Explicit stub - no implementation available
    throw new FetcherError(
      'Twitter/X integration not available',
      'PLATFORM_NOT_IMPLEMENTED',
      Platform.TWITTER
    );
  }
}
```

---

## 6 — Future Considerations

### 6.1 Phase 3 ML Pipeline Integration

- Status progression will change: `pending` → `fetched` → `enriched` → `done`
- Current "done" after fetch becomes intermediate state
- Fetcher hints guide ML processing (language, captions availability)

### 6.2 Caching & Deduplication (Task 2.16)

```typescript
// Future enhancement in BaseContentFetcher
protected async checkCache(url: string): Promise<FetchResponse | null> {
  // Task 2.16 will implement cross-user content deduplication
  // Canonical URL → shared metadata
  return null;
}
```

### 6.3 Monitoring & Observability

```typescript
interface EnhancedMetrics {
  'fetcher.cache.hits': Counter<'platform'>;     // Future caching
  'fetcher.auth.failures': Counter<'platform'>;  // OAuth issues
  'fetcher.compliance.blocked': Counter<'platform' | 'reason'>;
}
```

### 6.4 Adding New Platforms

1. Implement `ContentFetcherInterface`
2. Register in module providers
3. Add to `ENABLED_PLATFORMS` config
4. No changes to core pipeline needed

---

## 7 — Consequences

### Positive

- **Extensibility**: New platforms via simple interface implementation
- **Testability**: Platform logic isolated with fixture support
- **Maintainability**: Clear separation of concerns
- **Compliance**: Platforms can be disabled independently
- **Performance**: Respects rate limits and timeouts
- **Future-proof**: Clean integration points for ML pipeline

### Negative

- **Initial complexity**: More setup than monolithic approach
- **Registry overhead**: Additional abstraction layer
- **Monitoring needs**: Must track per-platform metrics

### Mitigations

- Comprehensive documentation and examples
- Automated tests for each platform
- Monitoring dashboards from day one

---

## 8 — Migration Path

### Phase 1: Foundation (Task 2.1 - Current)
- [x] Define interfaces and base classes
- [x] Implement registry pattern
- [x] Create module structure
- [x] Update ShareProcessor integration

### Phase 2: Platform Implementation (Tasks 2.2-2.4, 2.14)
- [ ] TikTok fetcher with oEmbed
- [ ] Reddit fetcher with JSON endpoint
- [ ] Twitter stub with error response
- [ ] Generic OpenGraph fetcher

### Phase 3: Enhancement (Task 2.15)
- [ ] YouTube with official API
- [ ] Instagram with Graph API
- [ ] Caching layer implementation

---

## 9 — References

- ADR-005: BullMQ Worker Design - Extensibility hooks and retry strategy
- ADR-004: Shares Endpoint - Platform detection at creation
- ADR-012: API Style Guide - Error taxonomy and standards
- Task 1.5: Worker implementation with `processPlatformContent` hook
- Task 2.8: Metadata storage schema design
- Task 2.7: Media download and storage separation
- Task 2.12: Test fixtures for reliable CI
- Task 2.16: URL canonicalization and deduplication
- Task 2.17: Compliance and privacy review