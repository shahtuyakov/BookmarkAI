import { getClient } from '../utils';
import { Share } from '../types';

// Sample shares data
const shares: Share[] = [
  {
    id: 'a7c81a98-cfd0-4c69-85fb-e9ab901b0d14',
    user_id: '81f9a979-367e-40e2-8df0-5501705c95d0', // Alex's ID
    url: 'https://www.reddit.com/r/programming/comments/abcdef/interesting_programming_tips/',
    platform: 'reddit',
    status: 'completed',
    idempotency_key: 'def456'
  },
  {
    id: 'b2c6d8e1-3f4a-5b6c-7d8e-9f0a1b2c3d4e',
    user_id: 'b0f24e05-967a-45a1-9c45-8f171c539c62', // Sam's ID
    url: 'https://twitter.com/techguru/status/1234567890123456789',
    platform: 'twitter',
    status: 'completed',
    idempotency_key: 'ghi789'
  }
];

export async function seedShares(): Promise<void> {
  const client = getClient();
  try {
    await client.connect();
    console.log('Seeding shares...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    for (const share of shares) {
      try {
        await client.query(`
          INSERT INTO shares (
            id, user_id, url, platform, status, idempotency_key,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [
          share.id, 
          share.user_id, 
          share.url, 
          share.platform, 
          share.status,
          share.idempotency_key
        ]);
        console.log(`Seeded share: ${share.id} (${share.platform})`);
      } catch (err) {
        console.error(`Error seeding share ${share.id}:`, (err as Error).message);
        await client.query('ROLLBACK');
        throw err;
      }
    }
    
    // If all successful, commit
    await client.query('COMMIT');
    console.log('Share seeding complete');
    
  } catch (err) {
    console.error('Database error:', (err as Error).message);
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
} 