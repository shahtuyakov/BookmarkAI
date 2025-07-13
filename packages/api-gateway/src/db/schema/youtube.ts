import { 
  pgTable, 
  uuid, 
  timestamp, 
  varchar, 
  text, 
  index, 
  integer,
  boolean,
  decimal,
  jsonb,
  unique,
  date,
  bigint,
  customType,
  check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { shares } from './shares';

// Create a function that returns a custom vector type with specified dimensions
function vectorWithDimensions(dimensions: number) {
  return customType<{ data: number[] }>({
    dataType() {
      return `vector(${dimensions})`;
    },
  });
}

/**
 * YouTube content metadata and processing status
 */
export const youtubeContent = pgTable('youtube_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  youtubeId: varchar('youtube_id', { length: 20 }).notNull().unique(),
  
  // Channel information
  channelId: varchar('channel_id', { length: 50 }),
  channelTitle: varchar('channel_title', { length: 255 }),
  
  // Video metadata
  durationSeconds: integer('duration_seconds'),
  viewCount: bigint('view_count', { mode: 'number' }),
  likeCount: bigint('like_count', { mode: 'number' }),
  commentCount: bigint('comment_count', { mode: 'number' }),
  
  // Content classification
  contentType: varchar('content_type', { length: 50 }).notNull(), // youtube_short, youtube_standard, etc.
  processingPriority: integer('processing_priority').default(5),
  
  // Availability flags
  hasCaptions: boolean('has_captions').default(false),
  isShort: boolean('is_short').default(false),
  isLive: boolean('is_live').default(false),
  isMusic: boolean('is_music').default(false),
  
  // Content rating and restrictions
  contentRating: varchar('content_rating', { length: 20 }),
  privacyStatus: varchar('privacy_status', { length: 20 }),
  
  // Publishing information
  publishedAt: timestamp('published_at'),
  tags: text('tags').array(),
  
  // Processing strategy used
  downloadStrategy: varchar('download_strategy', { length: 20 }), // full, audio, none
  transcriptionStrategy: varchar('transcription_strategy', { length: 30 }), // api_captions, whisper_full, whisper_chunked, skip
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_youtube_content_share_id').on(table.shareId),
    youtubeIdIdx: index('idx_youtube_content_youtube_id').on(table.youtubeId),
    channelIdx: index('idx_youtube_content_channel').on(table.channelId),
    contentTypeIdx: index('idx_youtube_content_type').on(table.contentType),
    priorityIdx: index('idx_youtube_content_priority').on(table.processingPriority),
    publishedAtIdx: index('idx_youtube_content_published').on(table.publishedAt),
    typePriorityIdx: index('idx_youtube_content_type_priority').on(table.contentType, table.processingPriority)
  };
});

/**
 * Video chapters for timestamp-based search and navigation
 */
export const youtubeChapters = pgTable('youtube_chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  youtubeContentId: uuid('youtube_content_id').notNull().references(() => youtubeContent.id, { onDelete: 'cascade' }),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  
  // Chapter timing
  startSeconds: integer('start_seconds').notNull(),
  endSeconds: integer('end_seconds'),
  title: varchar('title', { length: 500 }),
  
  // Chapter content
  summary: text('summary'),
  transcriptSegment: text('transcript_segment'),
  keyPoints: text('key_points').array(),
  
  // Search and embeddings
  embedding: vectorWithDimensions(1536)('embedding'),
  searchKeywords: text('search_keywords').array(),
  
  // Metadata
  chapterOrder: integer('chapter_order'),
  durationSeconds: integer('duration_seconds'),
  
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_youtube_chapters_share').on(table.shareId),
    contentIdIdx: index('idx_youtube_chapters_content').on(table.youtubeContentId),
    timingIdx: index('idx_youtube_chapters_timing').on(table.startSeconds, table.endSeconds),
    // Note: Vector index needs to be created manually with SQL migration
    // CREATE INDEX idx_youtube_chapters_embedding ON youtube_chapters 
    // USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    timingOrderIdx: index('idx_youtube_chapters_timing_order').on(table.youtubeContentId, table.startSeconds, table.chapterOrder),
    
    // Check constraints
    validChapterTiming: check('chk_valid_chapter_timing', sql`${table.endSeconds} > ${table.startSeconds} OR ${table.endSeconds} IS NULL`)
  };
});

/**
 * YouTube enhancement processing status and tracking
 */
export const youtubeEnhancements = pgTable('youtube_enhancements', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  youtubeContentId: uuid('youtube_content_id').notNull().references(() => youtubeContent.id, { onDelete: 'cascade' }),
  
  // Phase tracking
  phase1CompletedAt: timestamp('phase1_completed_at'),      // API fetch completed
  phase2StartedAt: timestamp('phase2_started_at'),          // Background processing started
  phase2CompletedAt: timestamp('phase2_completed_at'),      // Background processing completed
  
  // Individual step status
  downloadStatus: varchar('download_status', { length: 50 }).default('pending'),     // pending, completed, failed, skipped
  downloadFilePath: text('download_file_path'),
  downloadFileSize: integer('download_file_size'),
  
  transcriptionStatus: varchar('transcription_status', { length: 50 }).default('pending'), // pending, completed, failed, skipped
  transcriptionSource: varchar('transcription_source', { length: 20 }),                   // youtube_api, whisper
  transcriptionLanguage: varchar('transcription_language', { length: 10 }),
  transcriptionConfidence: decimal('transcription_confidence', { precision: 4, scale: 3 }),
  
  summaryStatus: varchar('summary_status', { length: 50 }).default('pending'),       // pending, completed, failed
  summaryLength: integer('summary_length'),
  summaryComplexity: varchar('summary_complexity', { length: 20 }),
  
  embeddingStatus: varchar('embedding_status', { length: 50 }).default('pending'),     // pending, completed, failed
  embeddingsCount: integer('embeddings_count').default(0),
  chaptersCount: integer('chapters_count').default(0),
  
  // Error tracking
  errorDetails: jsonb('error_details'),
  retryCount: integer('retry_count').default(0),
  lastRetryAt: timestamp('last_retry_at'),
  
  // Performance tracking
  totalProcessingTimeSeconds: integer('total_processing_time_seconds'),
  downloadTimeSeconds: integer('download_time_seconds'),
  transcriptionTimeSeconds: integer('transcription_time_seconds'),
  
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_youtube_enhancements_share').on(table.shareId),
    pendingIdx: index('idx_youtube_enhancements_pending').on(table.phase2StartedAt).where(sql`phase2_completed_at IS NULL AND phase2_started_at IS NOT NULL`),
    failedIdx: index('idx_youtube_enhancements_failed').on(table.downloadStatus, table.transcriptionStatus, table.summaryStatus).where(sql`download_status = 'failed' OR transcription_status = 'failed' OR summary_status = 'failed'`)
  };
});

/**
 * YouTube API quota usage tracking
 */
export const youtubeQuotaUsage = pgTable('youtube_quota_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  date: date('date').notNull().defaultNow(),
  
  // Operation breakdown
  videosListCalls: integer('videos_list_calls').default(0),
  captionsListCalls: integer('captions_list_calls').default(0),
  captionsDownloadCalls: integer('captions_download_calls').default(0),
  channelsListCalls: integer('channels_list_calls').default(0),
  searchListCalls: integer('search_list_calls').default(0),
  
  // Total quota consumption
  totalQuotaUsed: integer('total_quota_used').default(0),
  quotaLimit: integer('quota_limit').default(10000),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    dateIdx: index('idx_youtube_quota_date').on(table.date),
    uniqueDate: unique('unique_youtube_quota_date').on(table.date)
  };
});