import { verifyTable } from './utils';
import { seedUsers } from './modules/users';
import { seedShares } from './modules/shares';
import { seedTranscripts } from './modules/transcripts';
import { triggerEmbeddings } from './modules/embeddings';

// Parse command line arguments
const args = process.argv.slice(2);
const shouldSeedUsers = args.includes('--users') || args.includes('--all');
const shouldSeedShares = args.includes('--shares') || args.includes('--all');
const shouldSeedTranscripts = args.includes('--transcripts') || args.includes('--all');
const shouldTriggerEmbeddings = args.includes('--embeddings') || args.includes('--all');

async function main(): Promise<void> {
  try {
    console.log('Starting seed process...');
    
    // Verify required tables exist
    const usersTableExists = await verifyTable('users');
    const sharesTableExists = await verifyTable('shares');
    const transcriptsTableExists = await verifyTable('transcripts');
    
    if (!usersTableExists || !sharesTableExists || !transcriptsTableExists) {
      console.error('Required tables are missing. Please run migrations first.');
      return;
    }
    
    if (shouldSeedUsers) {
      await seedUsers();
    }
    
    if (shouldSeedShares) {
      await seedShares();
    }
    
    if (shouldSeedTranscripts) {
      await seedTranscripts();
    }
    
    if (shouldTriggerEmbeddings) {
      try {
        await triggerEmbeddings();
      } catch (err) {
        console.error('Error triggering embeddings:', (err as Error).message);
      }
    }
    
    console.log('Seed process completed successfully');
  } catch (error) {
    console.error('Seed process failed', error);
    process.exit(1);
  }
}

main(); 