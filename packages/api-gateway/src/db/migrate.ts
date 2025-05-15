import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as path from 'path';
import { createHnswIndexes } from './migrations-custom/hnsw-indexes';

async function runMigrations() {
  console.log('🏗️ Running database migrations...');
  
  const pool = new Pool({
    host: 'localhost',
    port: 5433,
    user: 'bookmarkai',
    password: 'bookmarkai_password',
    database: 'bookmarkai_dev',  // Changed from bookmarkai to bookmarkai_dev
  });

  const db = drizzle(pool);

  try {
    // Enable pgvector extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ Enabled pgvector extension');
    
    // Run migrations from the migrations folder
    await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
    console.log('✅ Migrations complete');
    
    // Create HNSW indexes for vector search
    await createHnswIndexes();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();