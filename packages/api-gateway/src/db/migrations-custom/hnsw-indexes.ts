import { Pool } from 'pg';

export async function createHnswIndexes() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: Number(process.env.POSTGRES_PORT) || 5433,
    user: process.env.POSTGRES_USER || 'bookmarkai',
    password: process.env.POSTGRES_PASSWORD || 'bookmarkai_password',
    database: process.env.POSTGRES_DB || 'bookmarkai_dev',
  });

  try {
    // Set HNSW parameters
    await pool.query('SET hnsw.ef_search = 100;');
    
    // Create HNSW index for embeddings
    await pool.query(`
      CREATE INDEX IF NOT EXISTS hnsw_embedding_idx 
      ON embeddings 
      USING hnsw (embedding vector_cosine_ops) 
      WITH (ef_construction = 128, m = 16);
    `);
    
    console.log('✅ Created HNSW indexes for vector search');
  } catch (error) {
    console.error('❌ Failed to create HNSW indexes:', error);
    throw error;
  } finally {
    await pool.end();
  }
}