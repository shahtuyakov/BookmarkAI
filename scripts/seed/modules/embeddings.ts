import Redis from 'ioredis';
import { getClient } from '../utils';
import { REDIS_CONFIG } from '../config';

interface EmbeddingJob {
  id: string;
  data: {
    share_id: string;
    transcript_id: string;
    priority: string;
    source: string;
  };
  timestamp: number;
}

export async function triggerEmbeddings(): Promise<void> {
  const client = getClient();
  const redisClient = new Redis(REDIS_CONFIG);
  
  try {
    await client.connect();
    console.log('Connected to database');
    
    // Get shares with transcripts but no embeddings
    const result = await client.query(`
      SELECT s.id, s.platform, t.id as transcript_id
      FROM shares s
      JOIN transcripts t ON s.id = t.share_id
      LEFT JOIN embeddings e ON s.id = e.share_id
      WHERE e.id IS NULL
    `);
    
    if (result.rows.length === 0) {
      console.log('No shares found needing embeddings');
      return;
    }
    
    console.log(`Found ${result.rows.length} shares needing embeddings`);
    
    // Create a job for each share
    for (const share of result.rows) {
      const jobId = `embed_job_${share.id}`;
      const job: EmbeddingJob = {
        id: jobId,
        data: {
          share_id: share.id,
          transcript_id: share.transcript_id,
          priority: 'high',
          source: 'seed'
        },
        timestamp: Date.now()
      };
      
      // Add to a Redis list
      await redisClient.rpush('embedding:jobs', JSON.stringify(job));
      
      console.log(`Queued embedding generation for share ${share.id}`);
    }
    
    console.log('All embedding jobs queued');
    
  } catch (err) {
    console.error('Error:', (err as Error).message);
    throw err;
  } finally {
    await client.end();
    await redisClient.quit();
    console.log('Database and Redis connections closed');
  }
} 