import { pgTable, uuid, timestamp, varchar, text, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  password: text('password').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  refreshHash: text('refresh_hash'),
  refreshFamilyId: uuid('refresh_family_id'),
  lastLogin: timestamp('last_login'),
  failedAttempts: integer('failed_attempts').default(0),
  failedAttemptsResetAt: timestamp('failed_attempts_reset_at'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});