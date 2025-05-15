import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: 'localhost',
    port: 5433,
    user: 'bookmarkai',
    password: 'bookmarkai_password',
    database: 'bookmarkai_dev',  // Changed from bookmarkai to bookmarkai_dev
  },
  // Enable vector extension support
  customStatements: {
    beforeAll: ['CREATE EXTENSION IF NOT EXISTS vector;'],
  },
} satisfies Config;