import { pgTable, uuid, timestamp, text, jsonb, index } from 'drizzle-orm/pg-core';
import { shares } from './shares';

export const transcripts = pgTable('transcripts', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  fullText: text('full_text').notNull(),
  segments: jsonb('segments'), // Store timestamped segments as JSON
  language: text('language'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_transcripts_share_id').on(table.shareId)
  };
});