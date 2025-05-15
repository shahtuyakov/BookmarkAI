import { pgTable, uuid, timestamp, varchar, text, jsonb, index } from 'drizzle-orm/pg-core';
import { shares } from './shares';

export const metadata = pgTable('metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  shareId: uuid('share_id').notNull().references(() => shares.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 50 }).notNull(),
  author: varchar('author', { length: 255 }),
  title: text('title'),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  platformData: jsonb('platform_data'), // Store platform-specific data
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    shareIdIdx: index('idx_metadata_share_id').on(table.shareId),
    platformIdx: index('idx_metadata_platform').on(table.platform)
  };
});