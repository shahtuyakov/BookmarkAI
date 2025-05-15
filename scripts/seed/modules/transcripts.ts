import { getClient } from '../utils';
import { Transcript } from '../types';

// Sample transcript data
const transcripts: Transcript[] = [
  {
    id: '32f5b8e7-9c4d-5a6b-7e8f-9a0b1c2d3e4f',
    share_id: 'a7c81a98-cfd0-4c69-85fb-e9ab901b0d14', // Reddit share ID
    full_text: "Programming in 2025 has evolved significantly. Modern languages now focus on developer experience while maintaining runtime efficiency. Memory safety is a default feature, and type systems have become more powerful yet user-friendly. Concurrency patterns have simplified, and AI-assisted development has changed how we debug and optimize code.",
    segments: [
      {
        start: 0.0,
        end: 0.0, // Text post
        text: "Programming in 2025 has evolved significantly."
      }
    ],
    language: "en"
  },
  {
    id: '76a5e4c3-2b1d-9e8f-7a6c-5d4e3f2a1b0c',
    share_id: 'b2c6d8e1-3f4a-5b6c-7d8e-9f0a1b2c3d4e', // Twitter share ID
    full_text: "Just discovered this amazing productivity hack! First, use time blocking with 90-minute deep work sessions. Second, adopt a second brain approach to note-taking. Third, implement a weekly review process that actually works. Finally, automate repetitive tasks with simple scripts - even non-programmers can do this!",
    segments: [
      {
        start: 0.0,
        end: 0.0, // Text tweet
        text: "Just discovered this amazing productivity hack! Thread 🧵👇"
      }
    ],
    language: "en"
  }
];

export async function seedTranscripts(): Promise<void> {
  const client = getClient();
  try {
    await client.connect();
    console.log('Seeding transcripts...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    for (const transcript of transcripts) {
      try {
        await client.query(`
          INSERT INTO transcripts (
            id, share_id, full_text, segments, 
            language, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [
          transcript.id, 
          transcript.share_id, 
          transcript.full_text, 
          JSON.stringify(transcript.segments),
          transcript.language
        ]);
        console.log(`Seeded transcript: ${transcript.id}`);
      } catch (err) {
        console.error(`Error seeding transcript ${transcript.id}:`, (err as Error).message);
        await client.query('ROLLBACK');
        throw err;
      }
    }
    
    // If all successful, commit
    await client.query('COMMIT');
    console.log('Transcript seeding complete');
    
  } catch (err) {
    console.error('Database error:', (err as Error).message);
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
} 