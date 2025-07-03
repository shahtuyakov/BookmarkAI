# Reddit Content Enhancement Plan

**Status**: Partially Implemented  
**Date**: January 30, 2025  
**Author**: Backend Team  
**Priority**: High (MVP Enhancement)

## Executive Summary

This document outlines a plan to enhance Reddit content processing in BookmarkAI by properly handling different Reddit post types (text, link, image, video, gallery, crosspost, poll). Currently, we process all Reddit posts uniformly, missing valuable context and content from different post types.

## What We Actually Implemented

### Summary of Reddit Content Processing Implementation

#### Focus: Text-Only Post Optimization

We decided to focus on optimizing Reddit text-only posts first, deferring video processing due to complexity.

#### What We Implemented

1. **Reddit Text-Only Post Optimization** ✅
   - Detection: Posts with `media.type === 'none'` and has selftext
   - Processing: Combines title + selftext for both summarization and embeddings
   - Result: Better context for text-only posts
   - Special handling in share processor for Reddit text posts

#### Current Implementation State
- Reddit text-only posts: Combined title+selftext processing ✅
- Reddit videos: Basic metadata extraction (URL stored but not downloaded) ⚠️
- Video enhancement workflow: Available but not processing Reddit videos ⚠️

#### Key Files Modified
- `packages/api-gateway/src/modules/shares/fetchers/platforms/reddit.fetcher.ts` - Text optimization
- `packages/api-gateway/src/modules/shares/queue/share-processor.ts` - Reddit text handling
- `packages/api-gateway/src/modules/ml-results/queue/ml-result-listener.processor.ts` - Combined content


## Current State

### What Works Well ✅
- Basic Reddit fetching via `.json` API
- **Enhanced** text post processing (title + selftext combined for better context)
- Standard ML pipeline (summarization + embeddings)
- Search functionality
- Text-only post detection and special handling

### Limitations ❌
- Reddit videos: Stored but not downloaded or transcribed
- Link posts: External URLs not captured or processed
- Image posts: URLs stored but no OCR or captioning
- Gallery posts: Only first image captured
- Crosspost: Original content not extracted
- Poll posts: Not detected or processed
- Missing rich metadata utilization (score, awards, flair)
- No comprehensive post type detection

## Proposed Enhancement

### Goals
1. **Detect and handle all Reddit post types appropriately**
2. **Extract maximum value from each post type**
3. **Maintain MVP simplicity (no comment fetching)**
4. **Enable future enhancements (video transcription, OCR)**

## Reddit Post Types & Processing Strategy

### 1. Text Post (Self Post)
**Current**: ✅ Fully supported (IMPLEMENTED)  
**Enhancement**: Add flair and metadata context

```json
{
  "is_self": true,
  "selftext": "Full post content...",
  "link_flair_text": "Tutorial"
}
```

**Processing**:
- Extract title + selftext
- Include flair for context
- Standard summarization flow

### 2. Link Post
**Current**: ❌ External URL ignored  
**Enhancement**: Capture and contextualize external links

```json
{
  "is_self": false,
  "url": "https://techcrunch.com/article",
  "domain": "techcrunch.com"
}
```

**Processing**:
- Store external URL
- Create embedding: "Link to {domain}: {title}"
- Flag for future article fetching

### 3. Image Post
**Current**: ⚠️ URL stored, not utilized  
**Enhancement**: Proper image handling

```json
{
  "post_hint": "image",
  "url": "https://i.redd.it/abc123.jpg"
}
```

**Processing**:
- Store image URL in media field
- Create embedding from title
- Flag as visual content
- Future: OCR for text extraction

### 4. Video Post
**Current**: ✅ Video download and transcription (IMPLEMENTED)  
**Enhancement**: ~~Video metadata extraction~~ Already handling videos

```json
{
  "is_video": true,
  "media": {
    "reddit_video": {
      "fallback_url": "https://v.redd.it/...",
      "duration": 120
    }
  }
}
```

**Processing** (IMPLEMENTED):
- Download video via yt-dlp
- Store in S3/local storage
- Queue for transcription through whisper service
- Video enhancement workflow (title + selftext + transcript)

### 5. Gallery Post
**Current**: ❌ Only first image captured  
**Enhancement**: Multi-image awareness

```json
{
  "is_gallery": true,
  "gallery_data": { "items": [...] },
  "media_metadata": { "image_id": {...} }
}
```

**Processing**:
- Store primary image URL
- Note total image count
- Create embedding: "[Gallery {count} images] {title}"

### 6. Crosspost
**Current**: ❌ Original content missed  
**Enhancement**: Extract original post

```json
{
  "crosspost_parent_list": [{
    "title": "Original title",
    "selftext": "Original content"
  }]
}
```

**Processing**:
- Extract original post content
- Note both subreddits
- Process as original post type

### 7. Poll Post
**Current**: ❌ Not detected  
**Enhancement**: Poll results extraction

```json
{
  "poll_data": {
    "options": [
      {"text": "Yes", "vote_count": 1523}
    ]
  }
}
```

**Processing**:
- Format poll question + results
- Include vote percentages
- Create structured summary

## Implementation Plan

### Phase 1: Type Detection & Basic Handling (Week 1)
**Goal**: Properly detect and handle all post types

1. **Update RedditFetcher**
   - Add `detectPostType()` method
   - Enhance `buildContent()` for each type
   - Store post type in metadata

2. **Enhance Content Building**
   - Text posts: Include flair context
   - Link posts: Capture external URL
   - Media posts: Proper type labeling
   - Crosspost: Extract original content

3. **Update ML Prompts**
   - Add Reddit-specific context
   - Include post type in prompts
   - Adjust based on flair

**Deliverables**:
- Enhanced RedditFetcher with type detection
- Post type stored in platformData
- Type-specific content extraction

### Phase 2: Metadata Utilization (Week 2)
**Goal**: Use Reddit's rich metadata for better processing

1. **Quality Signals**
   - High score posts (>1000) get detailed summaries
   - Low upvote_ratio (<0.7) note controversy
   - Award counts indicate value

2. **Contextual Processing**
   - Flair-based prompt adjustments
   - Subreddit context (technical vs general)
   - NSFW/Spoiler content flagging

3. **Structured Output**
   - Include metadata in embeddings
   - Surface key metrics in summaries
   - Enable metadata-based filtering

**Deliverables**:
- Metadata-aware processing
- Enhanced embedding quality
- Richer search results

### Phase 3: Future Enhancements (Post-MVP)
**Goal**: Advanced media processing

1. **Video Transcription**
   - Integrate with existing video workflow
   - Queue Reddit videos like TikTok
   - Duration-based processing

2. **Image OCR**
   - Extract text from code screenshots
   - Process diagrams and charts
   - Meme text extraction

3. **External Content**
   - Fetch linked articles
   - Summary aggregation
   - Copyright-compliant processing

## Database Schema Updates

### Shares Table - platformData Enhancement
```typescript
platformData: {
  // Existing fields
  ...existingData,
  
  // New fields
  postType: 'text' | 'link' | 'image' | 'video' | 'gallery' | 'crosspost' | 'poll',
  
  // Type-specific data
  linkData?: {
    externalUrl: string,
    domain: string
  },
  
  mediaData?: {
    mediaType: 'image' | 'video' | 'gallery',
    mediaUrl: string,
    duration?: number,
    imageCount?: number
  },
  
  pollData?: {
    question: string,
    results: Array<{option: string, votes: number, percentage: number}>
  },
  
  // Reddit metadata
  redditMetadata: {
    score: number,
    upvoteRatio: number,
    numComments: number,
    flair: string,
    subreddit: string,
    isNSFW: boolean,
    isSpoiler: boolean,
    awards: number
  }
}
```

## Success Metrics

1. **Type Coverage**: 100% of Reddit post types properly detected
2. **Content Extraction**: 90%+ of available content captured
3. **Search Relevance**: Improved findability for non-text posts
4. **Processing Time**: No significant increase (<500ms)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| API rate limits | Medium | Implement caching, respect limits |
| Increased complexity | Low | Phase approach, maintain simplicity |
| Storage costs | Low | Store URLs only, not media files |
| Processing time | Medium | Type-specific fast paths |

## Migration Strategy

1. **Backward Compatible**: New fields are optional
2. **Gradual Rollout**: Feature flag for enhanced processing
3. **Existing Content**: Batch update job for type detection
4. **No Breaking Changes**: Current flow continues working

## Alternative Approaches Considered

1. **Full Comment Processing**: Rejected - Too complex for MVP
2. **External Article Fetching**: Deferred - Copyright concerns
3. **Real-time Media Processing**: Deferred - Resource intensive

## Implementation Details

### Code Changes Made

#### 1. Reddit Fetcher (`reddit.fetcher.ts`)
```typescript
// Added YtDlpService for video downloads
constructor(
  private readonly httpService: HttpService,
  private readonly ytDlpService: YtDlpService,
) {}

// Enhanced content building for text posts
private buildContent(data: RedditPostData): string {
  const content: string[] = [];
  content.push(data.title);
  
  if (data.selftext) {
    content.push('\n\n');
    content.push(data.selftext);
  }
  
  return content.join('');
}

// Video download implementation
if (data.is_video && data.media?.reddit_video) {
  const videoUrl = data.media.reddit_video.fallback_url;
  const ytDlpResult = await this.ytDlpService.extractVideoInfo(url, true);
  
  result.media = {
    url: ytDlpResult.storageUrl,
    type: 'video',
    source: 'reddit'
  };
}
```

#### 2. Share Processor (`share-processor.ts`)
```typescript
// Added Reddit to video enhancement platforms
private readonly VIDEO_ENHANCEMENT_PLATFORMS = ['tiktok', 'youtube', 'reddit'];

// Fast track for Reddit text content
if (platform === 'reddit' && media?.type !== 'video') {
  const content = this.buildRedditContent(share);
  await this.queueEmbedding(share.id, content);
}
```

#### 3. ML Result Listener (`ml-result-listener.processor.ts`)
```typescript
// Enhanced Reddit content combination
if (platform === 'reddit') {
  const parts = [];
  if (platformData?.title) parts.push(platformData.title);
  if (platformData?.selftext) parts.push(platformData.selftext);
  if (transcriptResult?.transcript) parts.push(transcriptResult.transcript);
  
  return {
    content: parts.join('\n\n'),
    prompt: 'Summarize this Reddit post including any video transcript:'
  };
}
```

### Configuration Changes

#### Environment Variables
```bash
# No new environment variables required
# Uses existing S3/local storage configuration
```

#### Feature Flags
```typescript
// No feature flags - Reddit video processing enabled by default
// Controlled by existing video enhancement workflow
```

## Conclusion

This enhancement plan provides a structured approach to improving Reddit content processing while maintaining MVP simplicity. By properly detecting and handling different post types, we can extract more value from Reddit content without adding significant complexity.

## Testing & Debugging

### Test URLs for Different Scenarios

1. **Standard Reddit Video (DASH format)**
   ```
   https://www.reddit.com/r/[subreddit]/comments/[id]/[title]/
   ```

2. **Reddit Video without Audio**
   ```
   https://www.reddit.com/r/gifs/...
   ```

3. **Text-Only Post**
   ```
   https://www.reddit.com/r/AskReddit/...
   ```

### Debug Commands

```bash
# Test yt-dlp format availability
yt-dlp --list-formats "https://reddit.com/..."

# Test with Reddit-specific format
yt-dlp -f "bestvideo[height<=720]+bestaudio/best" "https://reddit.com/..."

# Check logs for workflow
tail -f logs/api-gateway.log | grep -E "reddit|Reddit|yt-dlp"
```

## Next Steps

### Completed ✅
1. Text post optimization (title + selftext)
2. Special handling for Reddit text-only posts in share processor
3. Combined content processing in ML result listener

### Remaining Work 🚧
1. **Phase 1 Completion**: Post type detection
   - Implement `detectPostType()` method
   - Store post type in platformData
   - Handle link, image, gallery, crosspost, poll types

2. **Phase 2**: Metadata utilization
   - Extract and store Reddit metadata (score, awards, flair)
   - Implement quality-based processing
   - Add metadata to embeddings

3. **Phase 3**: Advanced features (Post-MVP)
   - Image OCR for screenshots and diagrams
   - External link fetching (with copyright compliance)
   - Gallery multi-image handling