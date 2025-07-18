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
  emailVerified: boolean('email_verified').notNull().default(false),
  verificationToken: text('verification_token'),
  verificationTokenExpiry: timestamp('verification_token_expiry'),
  resetPasswordToken: text('reset_password_token'),
  resetPasswordTokenExpiry: timestamp('reset_password_token_expiry'),
  // Social auth fields
  provider: varchar('provider', { length: 20 }).notNull().default('email'),
  providerId: varchar('provider_id', { length: 255 }),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});