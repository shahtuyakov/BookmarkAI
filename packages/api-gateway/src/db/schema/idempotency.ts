import { pgTable, varchar, timestamp, text, index } from 'drizzle-orm/pg-core';

/**
 * Database table for idempotency records
 * Used as fallback when Redis is unavailable
 */
export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    key: varchar('key', { length: 255 }).primaryKey(),
    userId: varchar('user_id', { length: 255 }).notNull(),
    endpoint: varchar('endpoint', { length: 255 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('processing'),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseBody: text('response_body'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
    expiresAt: timestamp('expires_at').notNull(),
  },
  table => ({
    userEndpointIdx: index('idx_user_endpoint').on(table.userId, table.endpoint),
    requestHashIdx: index('idx_request_hash').on(table.requestHash),
    expiresAtIdx: index('idx_expires_at').on(table.expiresAt),
  }),
);
