import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// Create PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: Number(process.env.POSTGRES_PORT) || 5433,
  user: process.env.POSTGRES_USER || 'bookmarkai',
  password: process.env.POSTGRES_PASSWORD || 'bookmarkai_password',
  database: process.env.POSTGRES_DB || 'bookmarkai',
});

// Create and export drizzle instance
export const db = drizzle(pool);