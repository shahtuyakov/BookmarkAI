import { Client } from 'pg';
import { getClient } from '../utils';
import { User } from '../types';

// Sample user data
const users: User[] = [
  { id: '81f9a979-367e-40e2-8df0-5501705c95d0', email: 'alex2@example.com', name: 'Alex Smith', password: 'defaultpassword' },
  { id: 'b0f24e05-967a-45a1-9c45-8f171c539c62', email: 'sam2@example.com', name: 'Sam Johnson', password: 'defaultpassword' },
  { id: 'c6f3d76d-107c-4c4c-99f0-3e5a9f0bed92', email: 'taylor2@example.com', name: 'Taylor Wong', password: 'defaultpassword' },
  { id: 'd7f48b27-327c-4848-99f0-3e5a9f0bed92', email: 'jordan2@example.com', name: 'Jordan Rivera', password: 'defaultpassword' },
  { id: 'e8f59c39-547d-4a4a-99f0-3e5a9f0bed92', email: 'casey2@example.com', name: 'Casey Johnson', password: 'defaultpassword' }
];

export async function seedUsers(): Promise<void> {
  const client: Client = getClient();
  try {
    await client.connect();
    console.log('Seeding users...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    for (const user of users) {
      try {
        await client.query(`
          INSERT INTO users (id, email, name, password, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW(), NOW())
          ON CONFLICT (id) DO NOTHING
        `, [user.id, user.email, user.name, user.password]);
        
        console.log(`Seeded user: ${user.name}`);
      } catch (err) {
        console.error(`Error seeding user ${user.name}:`, (err as Error).message);
        await client.query('ROLLBACK');
        throw err;
      }
    }
    
    // If all successful, commit
    await client.query('COMMIT');
    console.log(`User seeding complete - inserted/updated ${users.length} users`);
    
  } catch (err) {
    console.error('User seeding failed:', (err as Error).message);
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
} 