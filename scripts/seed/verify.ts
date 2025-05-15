import { Client } from 'pg';
import { DB_CONFIG } from './config';

interface UserRow {
  id: string;
  email: string;
  name: string;
}

interface ShareRow {
  id: string;
  user_id: string;
  platform: string;
  status: string;
}

interface TranscriptRow {
  id: string;
  share_id: string;
  preview: string;
  language: string;
}

interface RelationshipRow {
  user: string;
  platform: string;
  transcript_id: string;
  transcript_preview: string;
}

async function verifySeeding(): Promise<void> {
  const client = new Client(DB_CONFIG);
  try {
    await client.connect();
    console.log('Connected to database for verification');
    
    // Check users
    console.log('\n--- Verifying Users ---');
    const usersResult = await client.query<UserRow>("SELECT id, email, name FROM users");
    console.log(`Found ${usersResult.rowCount} total users`);
    console.table(usersResult.rows);
    
    // Check shares
    console.log('\n--- Verifying Shares ---');
    const sharesResult = await client.query<ShareRow>("SELECT id, user_id, platform, status FROM shares");
    console.log(`Found ${sharesResult.rowCount} total shares`);
    console.table(sharesResult.rows);
    
    // Check transcripts
    console.log('\n--- Verifying Transcripts ---');
    const transcriptsResult = await client.query<TranscriptRow>(`
      SELECT id, share_id, LEFT(full_text, 50) as preview, language 
      FROM transcripts
    `);
    console.log(`Found ${transcriptsResult.rowCount} total transcripts`);
    console.table(transcriptsResult.rows);
    
    // Check relationships
    console.log('\n--- Verifying Relationships ---');
    const relationshipsResult = await client.query<RelationshipRow>(`
      SELECT 
        u.email as user,
        s.platform, 
        t.id as transcript_id,
        LEFT(t.full_text, 30) as transcript_preview
      FROM shares s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN transcripts t ON s.id = t.share_id
      ORDER BY u.email, s.platform
    `);
    
    console.log(`Found ${relationshipsResult.rowCount} complete relationships`);
    console.table(relationshipsResult.rows);
    
  } catch (err) {
    console.error('Verification error:', (err as Error).message);
  } finally {
    await client.end();
    console.log('\nVerification complete');
  }
}

// Execute the function
verifySeeding(); 