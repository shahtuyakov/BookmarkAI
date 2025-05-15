import { Client } from 'pg';
import type { Client as PgClient } from 'pg';
import { DB_CONFIG } from './config';

export function getClient(): PgClient {
  return new Client(DB_CONFIG);
}

export async function verifyTable(tableName: string): Promise<boolean> {
  const client = getClient();
  try {
    await client.connect();
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      );
    `, [tableName]);
    
    return result.rows[0].exists;
  } finally {
    await client.end();
  }
}

export function logTable<T>(data: T[]): void {
  if (data.length === 0) {
    console.log('No data found');
    return;
  }
  
  console.table(data);
} 