# YouTube Fetcher Phase 2 Implementation Prompt

## Context
Phase 1 of the YouTube fetcher implementation has been completed successfully. The immediate YouTube API fetch with content classification is working and tested. Now we need to implement Phase 2: the background enhancement pipeline for comprehensive content processing.

## Current State
### Completed (Phase 1) ✅
- YouTube Fetcher with API integration
- Content Classifier (5 types: short, music, standard, long, educational)
- Quota Manager with Redis backing
- Error handling with YouTube-specific errors
- Database schema (4 tables created and migrated)
- URL validation for all YouTube formats including Shorts
- Quick embedding generation for immediate searchability

### Working Examples
- YouTube Shorts: `https://youtube.com/shorts/kzi9MQQ6K3A` → classified as `youtube_short`
- Music Videos: `https://youtu.be/O0WXurYM09k` → classified as `youtube_music`

## Phase 2 Requirements
Implement the background enhancement pipeline following ADR-213 specifications:

### 1. YouTube Enhancement Queue
**File**: Create `packages/api-gateway/src/modules/shares/queue/youtube-enhancement-queue.service.ts`
- Implement BullMQ queue for background processing
- Use priority levels from `youtube-enhancement-queue.constants.ts`
- Queue jobs with metadata from Phase 1 fetch

### 2. YouTube Enhancement Processor
**File**: Create `packages/api-gateway/src/modules/shares/queue/youtube-enhancement.processor.ts`
- Process queued enhancement jobs
- Implement smart download decision logic based on content type
- Coordinate download → transcription → summarization → embedding pipeline
- Update `youtube_enhancements` table with progress
- Handle errors and retries gracefully

### 3. YouTube Download Service
**File**: Create `packages/api-gateway/src/modules/shares/services/youtube-download.service.ts`
- Integrate with existing `YtDlpService`
- Implement quality selection based on processing strategy:
  - Shorts: 360p full video
  - Educational: 720p (or audio-only if >15 min)
  - Long: audio-only
  - Music: skip download
- Store downloads using `S3StorageService`
- Implement file cleanup after processing

### 4. Integration Points
- Connect with existing `TranscriptionService` for Whisper processing
- Use `MLProducerService` for ML tasks (already injected in ShareProcessor)
- Update `ShareProcessor.processYouTubeEnhancement()` to queue enhancement jobs
- Store enhancement metadata in `youtube_content` table

### 5. Chapter Extraction (Optional for now)
- Parse timestamps from video description
- Create chapter entries in `youtube_chapters` table
- Generate separate embeddings per chapter

## Implementation Strategy
1. Start with the Enhancement Queue service
2. Create the Enhancement Processor with basic job handling
3. Implement Download Service with yt-dlp integration
4. Connect all pieces and test with real YouTube URLs
5. Add comprehensive error handling and monitoring

## Key Files to Reference
- `packages/api-gateway/src/modules/shares/queue/share-processor.ts` - See `processYouTubeEnhancement()` method
- `packages/api-gateway/src/modules/shares/services/ytdlp.service.ts` - Existing download service
- `packages/api-gateway/src/modules/ml/ml-producer.service.ts` - ML task queuing
- `docs/architecture/decisions/adr-213-youtube-fetcher-implementation.md` - Full specifications

## Processing Strategies by Content Type
```typescript
// From YouTube Content Classifier
- youtube_short: downloadStrategy: 'full', quality: '360p', transcription: 'whisper_full'
- youtube_music: downloadStrategy: 'none', transcription: 'skip'
- youtube_standard: downloadStrategy: 'full', quality: '720p', transcription: 'whisper_full'
- youtube_long: downloadStrategy: 'audio', quality: 'audio-only', transcription: 'whisper_chunked'
- youtube_educational: downloadStrategy: varies, transcription: 'whisper_chunked'
```

## Database Tables Available
- `youtube_content` - Video metadata (already populated in Phase 1)
- `youtube_enhancements` - Track enhancement progress
- `youtube_chapters` - Store chapter data
- `youtube_quota_usage` - API quota tracking (already in use)

## Testing Approach
1. Use the same YouTube URLs that worked in Phase 1
2. Monitor logs for enhancement job processing
3. Check `youtube_enhancements` table for progress updates
4. Verify files are downloaded and cleaned up
5. Confirm ML tasks are queued properly

## Success Criteria
- Enhancement jobs are queued based on content type priority
- Downloads complete successfully with appropriate quality
- Transcription tasks are queued for non-music content
- Enhancement status is tracked in database
- Errors are handled gracefully with retries
- Files are cleaned up after processing

Start by creating the YouTube Enhancement Queue service and gradually build out the complete Phase 2 pipeline.