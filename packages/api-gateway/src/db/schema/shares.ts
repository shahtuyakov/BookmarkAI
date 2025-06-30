import { pgTable, uuid, timestamp, varchar, text, index, unique, jsonb, integer } from 'drizzle-orm/pg-core';
import { users } from './users';

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  status: varchar('status', { length: 50}).notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  // Content metadata fields
  title: text('title'),
  description: text('description'),
  author: varchar('author', { length: 255 }),
  thumbnailUrl: text('thumbnail_url'),
  mediaUrl: text('media_url'),
  mediaType: varchar('media_type', { length: 50 }),
  platformData: jsonb('platform_data'),
  // Video workflow enhancement fields
  workflowState: varchar('workflow_state', { length: 50 }),
  enhancementStartedAt: timestamp('enhancement_started_at'),
  enhancementCompletedAt: timestamp('enhancement_completed_at'),
  enhancementVersion: integer('enhancement_version').default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    userIdIdx: index('idx_shares_user_id').on(table.userId),
    statusIdx: index('idx_shares_status').on(table.status),
    urlUserIdx: unique('idx_shares_url_user_id').on(table.url, table.userId),
    workflowStateIdx: index('idx_shares_workflow_state').on(table.workflowState)
  };
});