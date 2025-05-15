import { pgTable, uuid, timestamp, varchar, text, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users';

export const shares = pgTable('shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  status: varchar('status', { length: 50}).notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 100 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => {
  return {
    userIdIdx: index('idx_shares_user_id').on(table.userId),
    statusIdx: index('idx_shares_status').on(table.status),
    urlUserIdx: unique('idx_shares_url_user_id').on(table.url, table.userId)
  };
});