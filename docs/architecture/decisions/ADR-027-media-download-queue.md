# ADR-027: Asynchronous Media Download Queue Implementation

**Status**: Proposed  
**Date**: 2025-01-30  
**Decision makers**: Backend Team, Infrastructure Team  
**Related ADRs**: ADR-024 (Video Enhancement Workflow), ADR-025 (pgvector Integration)

## Context

BookmarkAI currently downloads media files (videos, images) synchronously during the content fetching process. This approach creates significant bottlenecks and scalability issues as our user base grows.

### Current State Analysis

#### Implementation Overview
```typescript
// Current synchronous flow in tiktok.fetcher.ts
async fetchContent(request: FetchRequest): Promise<FetchResponse> {
  // 1. Fetch metadata via oEmbed
  const oembedData = await this.fetchWithTimeout(oembedUrl);
  
  // 2. BLOCKING: Download video immediately
  const ytDlpResult = await this.ytDlpService.extractVideoInfo(url, true);
  // This blocks for 10-60 seconds per video!
  
  // 3. Return response with storage URL
  return {
    media: { url: ytDlpResult.storageUrl }
  };
}
```

#### Performance Metrics
- **Average download time**: 15-30 seconds per video
- **Worker thread blocking**: 100% during download
- **Concurrent capacity**: ~10-20 videos (limited by worker threads)
- **Memory usage**: 50-200MB per download in API process
- **Failure rate**: 5-10% due to timeouts, network issues

#### Bottlenecks Identified

1. **Thread Exhaustion**
   - Each download blocks a NestJS worker thread
   - Default 4 workers = max 4 concurrent downloads
   - Other API requests queue behind downloads

2. **Memory Pressure**
   - Videos downloaded into API process memory
   - Large videos (100MB+) cause memory spikes
   - No isolation from API serving

3. **Cascade Failures**
   - Download failures block entire share creation
   - No retry mechanism for transient failures
   - Users must re-submit on failure

4. **Resource Competition**
   - Downloads compete with API requests for CPU/network
   - No prioritization mechanism
   - Cannot scale download capacity independently

## Decision

Implement an asynchronous media download queue using BullMQ to decouple media downloads from the API request flow.

### Proposed Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Media Queue    │────▶│ Download Workers│
│                 │     │   (BullMQ)      │     │  (Scalable)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                                │
        ▼                                                ▼
┌─────────────────┐                            ┌─────────────────┐
│   Database      │◀───────────────────────────│  Storage (S3)   │
│ (Quick Update)  │                            │                 │
└─────────────────┘                            └─────────────────┘
```

### Implementation Design

#### 1. Queue Structure
```typescript
// Queue definition
export const MEDIA_DOWNLOAD_QUEUE = {
  NAME: 'media-download',
  JOBS: {
    DOWNLOAD_VIDEO: 'download-video',
    DOWNLOAD_IMAGE: 'download-image',
    DOWNLOAD_DOCUMENT: 'download-document',
  },
  PRIORITIES: {
    PREMIUM: 1,
    STANDARD: 10,
    BULK: 20,
  }
};

// Job interface
interface MediaDownloadJob {
  shareId: string;
  userId: string;
  url: string;
  mediaType: 'video' | 'image' | 'document';
  platform: Platform;
  metadata?: {
    expectedSize?: number;
    expectedDuration?: number;
    priority?: number;
  };
  retryCount?: number;
}
```

#### 2. Modified Share Processing Flow
```typescript
// share-processor.ts - New implementation
private async queueMediaDownload(shareId: string, media: any): Promise<void> {
  const job: MediaDownloadJob = {
    shareId,
    userId: this.share.userId,
    url: media.url,
    mediaType: media.type,
    platform: this.share.platform,
    metadata: {
      expectedSize: media.fileSize,
      expectedDuration: media.duration,
      priority: this.getUserPriority(this.share.userId),
    }
  };

  await this.mediaQueue.add(
    MEDIA_DOWNLOAD_QUEUE.JOBS.DOWNLOAD_VIDEO,
    job,
    {
      priority: job.metadata.priority,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  // Update share to indicate download is queued
  await this.sharesRepository.updateMediaStatus(shareId, 'download_queued');
}
```

#### 3. Download Worker Implementation
```typescript
@Processor(MEDIA_DOWNLOAD_QUEUE.NAME)
export class MediaDownloadProcessor {
  constructor(
    private readonly ytDlpService: YtDlpService,
    private readonly s3Storage: S3StorageService,
    private readonly sharesRepository: SharesRepository,
    private readonly metricsService: MetricsService,
  ) {}

  @Process({
    name: MEDIA_DOWNLOAD_QUEUE.JOBS.DOWNLOAD_VIDEO,
    concurrency: 10, // Configurable based on resources
  })
  async downloadVideo(job: Job<MediaDownloadJob>) {
    const { shareId, url, userId } = job.data;
    
    try {
      // Update status
      await this.sharesRepository.updateMediaStatus(shareId, 'downloading');
      
      // Download with progress tracking
      const result = await this.ytDlpService.extractVideoInfo(url, true);
      
      // Report progress
      await job.updateProgress(80);
      
      // Store in S3/local
      const storageUrl = await this.storeMedia(result, job.data);
      
      // Update database
      await this.sharesRepository.updateShare(shareId, {
        mediaUrl: storageUrl,
        mediaStatus: 'completed',
        mediaMetadata: {
          size: result.fileSize,
          duration: result.duration,
          downloadedAt: new Date(),
        }
      });
      
      // Emit event for further processing
      await this.eventBus.emit('media.downloaded', {
        shareId,
        userId,
        mediaUrl: storageUrl,
      });
      
      return { success: true, storageUrl };
      
    } catch (error) {
      await this.handleDownloadError(shareId, error, job);
      throw error; // Re-throw for Bull retry
    }
  }

  private async handleDownloadError(
    shareId: string, 
    error: Error, 
    job: Job
  ) {
    const isLastAttempt = job.attemptsMade >= job.opts.attempts;
    
    if (isLastAttempt) {
      await this.sharesRepository.updateMediaStatus(shareId, 'failed');
      await this.notifyUserOfFailure(job.data.userId, shareId);
    } else {
      await this.sharesRepository.updateMediaStatus(shareId, 'retry_pending');
    }
    
    // Log metrics
    this.metricsService.recordDownloadFailure(error.message);
  }
}
```

#### 4. Queue Configuration
```typescript
// bull.config.ts
export const mediaDownloadQueueConfig = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
  rateLimiter: {
    max: 100,        // Max 100 jobs
    duration: 60000, // per minute
  },
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 2,
  },
};
```

### Database Schema Changes

```sql
-- Add media status tracking
ALTER TABLE shares ADD COLUMN media_status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE shares ADD COLUMN media_download_attempts INT DEFAULT 0;
ALTER TABLE shares ADD COLUMN media_last_error TEXT;
ALTER TABLE shares ADD COLUMN media_metadata JSONB;

-- Add index for queue queries
CREATE INDEX idx_shares_media_status ON shares(media_status);
```

## Consequences

### Positive

1. **Scalability**
   - Can handle 100x more concurrent download requests
   - Download workers scale independently from API
   - Queue absorbs traffic spikes

2. **Performance**
   - API response time: 30s → 200ms
   - Non-blocking operation
   - Better resource utilization

3. **Reliability**
   - Automatic retry with exponential backoff
   - Failure isolation
   - Progress tracking

4. **User Experience**
   - Instant feedback on share creation
   - Background download status updates
   - No timeout errors

5. **Operational Benefits**
   - Separate monitoring for downloads
   - Rate limiting capabilities
   - Priority queue support

### Negative

1. **Complexity**
   - Additional queue infrastructure
   - More moving parts to monitor
   - State management across systems

2. **Eventual Consistency**
   - Media not immediately available
   - Need UI to handle "downloading" state
   - WebSocket/polling for status updates

3. **Storage Considerations**
   - Queue persistence requires Redis memory
   - Failed job retention for debugging

## Implementation Plan

### Phase 1: Queue Infrastructure (1 week)
- [ ] Set up BullMQ with Redis
- [ ] Create queue definitions and job interfaces
- [ ] Implement basic download worker
- [ ] Add monitoring dashboard

### Phase 2: Integration (1 week)
- [ ] Modify share processor to use queue
- [ ] Update database schema
- [ ] Implement status tracking
- [ ] Add retry logic

### Phase 3: Optimization (1 week)
- [ ] Add rate limiting
- [ ] Implement priority queues
- [ ] Add progress tracking
- [ ] Performance tuning

### Phase 4: Migration (1 week)
- [ ] Feature flag for gradual rollout
- [ ] Migrate existing synchronous downloads
- [ ] Monitor and fix edge cases
- [ ] Full production deployment

## Monitoring Strategy

```typescript
// Key metrics to track
interface MediaQueueMetrics {
  queueDepth: number;
  processingRate: number;
  successRate: number;
  averageDownloadTime: number;
  failuresByType: Record<string, number>;
  workerUtilization: number;
}

// Alerts
- Queue depth > 10,000
- Success rate < 90%
- Worker utilization > 80%
- Average download time > 60s
```

## Security Considerations

1. **URL Validation**
   - Sanitize URLs before queuing
   - Prevent SSRF attacks
   - Validate against allowlist

2. **Resource Limits**
   - Max file size limits
   - Download timeout limits
   - Rate limiting per user

3. **Access Control**
   - Verify user owns share before download
   - Signed URLs for private content

## Alternatives Considered

1. **Webhooks from External Service**
   - Pros: Completely offloaded
   - Cons: Vendor lock-in, costs

2. **Lambda/Serverless Functions**
   - Pros: Auto-scaling
   - Cons: Cold starts, 15-min timeout

3. **Synchronous with Larger Thread Pool**
   - Pros: Simpler architecture
   - Cons: Still blocks, doesn't scale

## Related Decisions

- ADR-024: Video Enhancement Workflow - Downloads feed into ML pipeline
- ADR-025: pgvector Integration - Media metadata used for embeddings
- ADR-026: (Future) CDN Integration for media delivery

## References

- [BullMQ Documentation](https://docs.bullmq.io/)
- [NestJS Bull Integration](https://docs.nestjs.com/techniques/queues)
- [YouTube-DL Architecture](https://github.com/yt-dlp/yt-dlp)