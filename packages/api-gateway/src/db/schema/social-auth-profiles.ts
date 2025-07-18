import { pgTable, uuid, timestamp, varchar, text, jsonb, unique, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const socialAuthProfiles = pgTable('social_auth_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  name: varchar('name', { length: 255 }),
  avatarUrl: text('avatar_url'),
  rawData: jsonb('raw_data'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return {
    providerUserUnique: unique('social_auth_profiles_provider_user_unique').on(table.provider, table.providerUserId),
    userIdIdx: index('idx_social_auth_profiles_user_id').on(table.userId),
  };
});