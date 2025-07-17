import { 
  pgTable, 
  uuid, 
  timestamp, 
  varchar, 
  text, 
  index, 
  integer,
  bigint,
  decimal,
  unique
} from 'drizzle-orm/pg-core';
import { shares } from './shares';

/**
 * Instagram content metadata and processing data
 * Following the simplified single-table approach from ADR-214
 */
export const instagramContent = pgTable('instagram_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  reelId: varchar('reel_id', { length: 100 }).notNull(),
  
  // Author information
  authorUsername: varchar('author_username', { length: 100 }),
  
  // Content metadata
  caption: text('caption'),
  hashtags: text('hashtags').array(),
  
  // Content classification
  contentType: varchar('content_type', { length: 50 }).notNull().default('instagram_reel_standard'),
  classificationConfidence: decimal('classification_confidence', { precision: 3, scale: 2 }),
  
  // Storage information (following TikTok pattern)
  storageUrl: text('storage_url'),           // S3 or local path to downloaded audio
  storageType: varchar('storage_type', { length: 20 }), // 'local' or 's3'
  fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
  durationSeconds: integer('duration_seconds'),
  
  // Processing results (stored after ML pipeline completion)
  transcriptText: text('transcript_text'),
  transcriptLanguage: varchar('transcript_language', { length: 10 }).default('en'),
  whisperConfidence: decimal('whisper_confidence', { precision: 3, scale: 2 }),
  
  // Metadata
  downloadTimeMs: integer('download_time_ms'),
  processingCompletedAt: timestamp('processing_completed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    shareIdIdx: index('idx_instagram_content_share_id').on(table.shareId),
    reelIdIdx: index('idx_instagram_content_reel_id').on(table.reelId),
    contentTypeIdx: index('idx_instagram_content_type').on(table.contentType),
    createdAtIdx: index('idx_instagram_content_created_at').on(table.createdAt),
    shareIdUnique: unique('instagram_content_share_id_unique').on(table.shareId)
  };
});