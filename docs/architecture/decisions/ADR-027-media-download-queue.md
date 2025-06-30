# ADR-027: Asynchronous Media Download Implementation

**Status**: Proposed  
**Date**: 2025-01-30  
**Decision makers**: Backend Team  
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

Implement a simple PostgreSQL-based asynchronous download system to decouple media downloads from the API request flow. Start with the simplest solution that solves the immediate problem, with the option to migrate to a more complex queue system (like BullMQ) if and when actual scale demands it.

### Proposed Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│   PostgreSQL    │◀────│ Download Workers│
│  (non-blocking) │     │  (shares table) │     │  (3-5 processes)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                                                         ▼
                                                ┌─────────────────┐
                                                │  Storage (S3)   │
                                                └─────────────────┘
```

### Implementation Design

#### 1. Database Schema Changes

```sql
-- Add download status tracking to existing shares table
ALTER TABLE shares ADD COLUMN download_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE shares ADD COLUMN download_attempts INT DEFAULT 0;
ALTER TABLE shares ADD COLUMN download_error TEXT;
ALTER TABLE shares ADD COLUMN download_started_at TIMESTAMP;
ALTER TABLE shares ADD COLUMN download_completed_at TIMESTAMP;

-- Add index for efficient queue queries
CREATE INDEX idx_shares_download_queue ON shares(download_status, created_at) 
WHERE download_status IN ('pending', 'retry');

-- Index for monitoring
CREATE INDEX idx_shares_download_status ON shares(download_status);
```

#### 2. Simple Download Worker

```typescript
// download-worker.service.ts
@Injectable()
export class DownloadWorkerService {
  private readonly logger = new Logger(DownloadWorkerService.name);
  private isRunning = true;

  constructor(
    private readonly db: DrizzleService,
    private readonly ytDlpService: YtDlpService,
  ) {}

  async start() {
    this.logger.log('Starting download worker');
    
    while (this.isRunning) {
      try {
        // Use PostgreSQL's row-level locking to grab next job
        const share = await this.getNextDownload();
        
        if (share) {
          await this.processDownload(share);
        } else {
          // No work available, wait before checking again
          await this.sleep(5000);
        }
      } catch (error) {
        this.logger.error(`Worker error: ${error.message}`);
        await this.sleep(5000);
      }
    }
  }

  private async getNextDownload() {
    // PostgreSQL's FOR UPDATE SKIP LOCKED ensures no two workers
    // process the same download
    const result = await this.db.database.execute(sql`
      UPDATE shares 
      SET download_status = 'processing',
          download_started_at = NOW()
      WHERE id = (
        SELECT id FROM shares 
        WHERE download_status IN ('pending', 'retry')
          AND download_attempts < 3
        ORDER BY 
          CASE WHEN download_status = 'retry' THEN 0 ELSE 1 END,
          created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    return result.rows[0];
  }

  private async processDownload(share: any) {
    try {
      this.logger.log(`Processing download for share ${share.id}`);
      
      // Use existing YtDlpService
      const result = await this.ytDlpService.extractVideoInfo(share.url, true);
      
      if (result && result.storageUrl) {
        // Success - update share with media URL
        await this.db.database
          .update(shares)
          .set({
            mediaUrl: result.storageUrl,
            mediaType: 'video',
            download_status: 'completed',
            download_completed_at: new Date(),
            platformData: {
              ...share.platformData,
              downloadMetadata: {
                size: result.fileSize,
                duration: result.duration,
                storageType: result.storageType,
              }
            }
          })
          .where(eq(shares.id, share.id));
          
        this.logger.log(`Download completed for share ${share.id}`);
      } else {
        throw new Error('Download failed - no storage URL returned');
      }
      
    } catch (error) {
      await this.handleDownloadError(share, error);
    }
  }

  private async handleDownloadError(share: any, error: Error) {
    const attempts = share.download_attempts + 1;
    const shouldRetry = attempts < 3;
    
    await this.db.database
      .update(shares)
      .set({
        download_status: shouldRetry ? 'retry' : 'failed',
        download_attempts: attempts,
        download_error: error.message,
      })
      .where(eq(shares.id, share.id));
      
    this.logger.error(
      `Download failed for share ${share.id} (attempt ${attempts}): ${error.message}`
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}
```

#### 3. Modified Share Processing Flow

```typescript
// share-processor.ts - Updated queueMediaDownload
private async queueMediaDownload(shareId: string, media: any): Promise<void> {
  // Simply mark the share as needing download
  // Workers will pick it up automatically
  await this.db.database
    .update(shares)
    .set({
      download_status: 'pending',
      // Store the original media URL for workers to use
      platformData: {
        ...this.share.platformData,
        originalMediaUrl: media.url,
      }
    })
    .where(eq(shares.id, shareId));
    
  this.logger.log(`Queued download for share ${shareId}`);
}
```

#### 4. Worker Management

```typescript
// main.ts - Start workers alongside API
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Start download workers based on environment
  const workerCount = parseInt(process.env.DOWNLOAD_WORKERS || '3', 10);
  
  for (let i = 0; i < workerCount; i++) {
    const worker = app.get(DownloadWorkerService);
    worker.start().catch(err => {
      console.error(`Worker ${i} crashed:`, err);
    });
  }
  
  await app.listen(3000);
}

// Alternative: Run workers as separate processes
// download-worker.ts
async function runWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const worker = app.get(DownloadWorkerService);
  await worker.start();
}

if (require.main === module) {
  runWorker();
}
```


## Consequences

### Positive

1. **Immediate Benefits**
   - API response time: 30s → <500ms
   - Non-blocking operation with minimal changes
   - Can handle 50-100 concurrent downloads
   - No new infrastructure required

2. **Simplicity**
   - Uses existing PostgreSQL database
   - Leverages native row-level locking
   - No additional dependencies
   - Easy to debug and monitor

3. **Reliability**
   - Built-in retry mechanism
   - Graceful failure handling
   - No data loss on crashes
   - Simple recovery procedures

4. **Cost Effective**
   - No Redis/BullMQ infrastructure costs
   - Uses existing database connections
   - Minimal operational overhead
   - Easy to maintain

### Negative

1. **Limited Scale**
   - Max ~100 concurrent downloads
   - Database polling overhead
   - No advanced queue features
   - Manual priority implementation

2. **Basic Features**
   - No built-in rate limiting
   - Simple retry logic only
   - No job progress tracking
   - Limited monitoring capabilities

3. **Future Migration**
   - Will need to migrate if scale increases 10x
   - Database schema will need updates
   - Worker code will need refactoring

## Implementation Plan

### Phase 1: Database & Worker Setup (2-3 days)
- [ ] Add download status columns to shares table
- [ ] Create database indexes for queue queries
- [ ] Implement DownloadWorkerService
- [ ] Test worker with mock downloads

### Phase 2: Integration (2 days)
- [ ] Update share processor to mark downloads as pending
- [ ] Add worker startup to application bootstrap
- [ ] Test end-to-end flow with real downloads
- [ ] Add basic error handling

### Phase 3: Monitoring & Deployment (2 days)
- [ ] Add simple metrics endpoint for queue depth
- [ ] Create basic monitoring queries
- [ ] Deploy with 3 workers to start
- [ ] Monitor performance and adjust

### Total: ~1 week (vs 4 weeks for complex solution)

## Monitoring Strategy

```sql
-- Simple monitoring queries
-- Queue depth
SELECT download_status, COUNT(*) 
FROM shares 
WHERE download_status != 'completed'
GROUP BY download_status;

-- Average download time
SELECT AVG(
  EXTRACT(EPOCH FROM (download_completed_at - download_started_at))
) as avg_seconds
FROM shares
WHERE download_status = 'completed'
  AND download_completed_at > NOW() - INTERVAL '1 hour';

-- Failure rate
SELECT 
  COUNT(CASE WHEN download_status = 'failed' THEN 1 END)::float / 
  COUNT(*)::float * 100 as failure_rate
FROM shares
WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Simple Grafana Dashboard
- Queue depth by status
- Downloads per minute
- Average download time
- Failure rate percentage

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

## Migration Path to Complex Queue System

If/when we need more scale, we can migrate to BullMQ:

1. **Triggers for Migration**
   - Consistent queue depth > 1000
   - Database polling causing performance issues
   - Need for advanced features (priorities, rate limiting)
   - Multiple queue types needed

2. **Migration Strategy**
   - Keep same worker interface
   - Add adapter pattern for queue operations
   - Gradually move from PostgreSQL to Redis
   - Maintain backward compatibility

3. **Code Structure Prepared for Migration**
   ```typescript
   interface QueueAdapter {
     getNextJob(): Promise<DownloadJob>;
     updateJobStatus(id: string, status: string): Promise<void>;
   }
   
   // Easy to swap implementations
   class PostgresQueueAdapter implements QueueAdapter { }
   class BullMQAdapter implements QueueAdapter { }
   ```

## Alternatives Considered

1. **BullMQ + Redis (Original Proposal)**
   - Pros: Industry standard, feature-rich, scales to millions
   - Cons: Over-engineered for current needs, additional infrastructure

2. **AWS SQS**
   - Pros: Managed service, infinite scale
   - Cons: Vendor lock-in, costs, complexity

3. **Keep Synchronous**
   - Pros: No changes needed
   - Cons: Blocking API threads is unsustainable

## Related Decisions

- ADR-024: Video Enhancement Workflow - Downloads feed into ML pipeline
- ADR-025: pgvector Integration - Media metadata used for embeddings
- ADR-026: (Future) CDN Integration for media delivery

## Summary

This ADR proposes a pragmatic solution that:
- Solves the immediate problem (blocking API threads)
- Uses existing infrastructure (PostgreSQL)
- Can be implemented in ~1 week
- Provides a clear migration path when needed
- Avoids premature optimization

The key insight is that PostgreSQL's `FOR UPDATE SKIP LOCKED` gives us a free, reliable queue that's perfect for our current scale. When we're consistently processing 1000+ downloads per hour, we can revisit and migrate to a dedicated queue system.

## References

- [PostgreSQL Row-Level Locking](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [SKIP LOCKED for Queue Processing](https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/)
- [YouTube-DL Architecture](https://github.com/yt-dlp/yt-dlp)