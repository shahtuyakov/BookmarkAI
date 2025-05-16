import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, QueryResult } from 'pg';
import * as schema from '../../db/schema';

@Injectable()
export class DrizzleService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  private db: ReturnType<typeof drizzle>;
  private readonly logger = new Logger(DrizzleService.name);

  constructor() {
    // Create PostgreSQL connection pool
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: Number(process.env.POSTGRES_PORT) || 5433,
      user: process.env.POSTGRES_USER || 'bookmarkai',
      password: process.env.POSTGRES_PASSWORD || 'bookmarkai_password',
      database: process.env.POSTGRES_DB || 'bookmarkai_dev',
    });

    // Create drizzle instance
    this.db = drizzle(this.pool, { schema });
  }

  // Get the database instance
  get database() {
    return this.db;
  }

  // Execute raw SQL (useful for health checks)
  async query(text: string, params: unknown[] = []): Promise<QueryResult<unknown>> {
    return this.pool.query(text, params);
  }

  // Lifecycle hooks
  async onModuleInit() {
    // Test connection when module initializes
    try {
      await this.pool.query('SELECT 1');
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    // Close the pool when the application shuts down
    await this.pool.end();
    this.logger.log('Database connection closed');
  }
}
