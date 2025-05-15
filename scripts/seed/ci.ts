#!/usr/bin/env node
import { Client } from 'pg';
import { performance } from 'perf_hooks';
import { DB_CONFIG } from './config';
import { seedUsers } from './modules/users';
import { seedShares } from './modules/shares';
import { seedTranscripts } from './modules/transcripts';
import { triggerEmbeddings } from './modules/embeddings';

// Configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const CLEAN_BEFORE_SEED = process.env.CLEAN_SEED === 'true';

/**
 * Class for handling CI/CD seeding process
 */
class CISeedManager {
  private client: Client;
  private startTime: number = 0;
  private stepTimings: Record<string, number> = {};

  constructor() {
    this.client = new Client(DB_CONFIG);
    this.logHeader(`Starting BookmarkAI Seed Process (${ENVIRONMENT})`);
  }

  /**
   * Main execution method
   */
  public async run(): Promise<void> {
    this.startTime = performance.now();
    
    try {
      await this.connect();
      await this.checkDatabaseConnection();
      await this.verifyDatabaseSchema();
      
      if (CLEAN_BEFORE_SEED) {
        await this.cleanExistingSeedData();
      }
      
      await this.executeSeedSteps();
      await this.verifyResults();
      
      this.logSuccess('Seed process completed successfully');
      this.printTimingSummary();
      
      process.exit(0);
    } catch (error) {
      this.logError('Seed process failed', error as Error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  /**
   * Connect to the database
   */
  private async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.logStep('Database connection established');
    } catch (error) {
      throw new Error(`Failed to connect to database: ${(error as Error).message}`);
    }
  }

  /**
   * Disconnect from the database
   */
  private async disconnect(): Promise<void> {
    try {
      await this.client.end();
      this.logStep('Database connection closed');
    } catch (error) {
      this.logWarning(`Error disconnecting from database: ${(error as Error).message}`);
    }
  }

  /**
   * Check database connection with a simple query
   */
  private async checkDatabaseConnection(): Promise<void> {
    try {
      const result = await this.client.query('SELECT NOW() as time');
      this.logStep(`Database connection verified (${result.rows[0].time})`);
    } catch (error) {
      throw new Error(`Database connection test failed: ${(error as Error).message}`);
    }
  }

  /**
   * Verify required tables exist
   */
  private async verifyDatabaseSchema(): Promise<void> {
    const requiredTables = ['users', 'shares', 'transcripts', 'embeddings'];
    const errors: string[] = [];
    
    for (const table of requiredTables) {
      try {
        const result = await this.client.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          );
        `, [table]);
        
        if (!result.rows[0].exists) {
          errors.push(`Table "${table}" does not exist`);
        }
      } catch (error) {
        errors.push(`Error checking for table "${table}": ${(error as Error).message}`);
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Database schema verification failed:\n${errors.join('\n')}`);
    }
    
    this.logStep('Database schema verified');
  }

  /**
   * Clean existing seed data before seeding
   */
  private async cleanExistingSeedData(): Promise<void> {
    this.logStep('Cleaning existing seed data...');
    
    try {
      await this.client.query('BEGIN');
      
      // Delete transcripts first due to foreign key constraints
      const deleteTranscripts = await this.client.query(`
        DELETE FROM transcripts 
        WHERE id::text LIKE '________-____-____-____-____________'
        AND share_id IN (
          SELECT id FROM shares 
          WHERE user_id IN (
            SELECT id FROM users 
            WHERE email LIKE '%@example.com'
          )
        )
      `);
      
      // Then delete shares
      const deleteShares = await this.client.query(`
        DELETE FROM shares 
        WHERE user_id IN (
          SELECT id FROM users 
          WHERE email LIKE '%@example.com'
        )
      `);
      
      // Finally delete users
      const deleteUsers = await this.client.query(`
        DELETE FROM users 
        WHERE email LIKE '%@example.com'
      `);
      
      await this.client.query('COMMIT');
      
      this.logStep(`Cleaned ${deleteUsers.rowCount} users, ${deleteShares.rowCount} shares, and ${deleteTranscripts.rowCount} transcripts`);
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw new Error(`Failed to clean existing seed data: ${(error as Error).message}`);
    }
  }

  /**
   * Execute all seed steps with retry logic
   */
  private async executeSeedSteps(): Promise<void> {
    const steps = [
      { name: 'users', fn: seedUsers },
      { name: 'shares', fn: seedShares },
      { name: 'transcripts', fn: seedTranscripts },
      { name: 'embeddings', fn: triggerEmbeddings }
    ];
    
    for (const step of steps) {
      let attempt = 1;
      let success = false;
      
      while (attempt <= MAX_RETRIES && !success) {
        try {
          this.logStepStart(`Seeding ${step.name} (attempt ${attempt}/${MAX_RETRIES})`);
          const stepStartTime = performance.now();
          
          await step.fn();
          
          const stepTime = performance.now() - stepStartTime;
          this.stepTimings[step.name] = stepTime;
          
          this.logStepComplete(`Completed seeding ${step.name} in ${this.formatTime(stepTime)}`);
          success = true;
        } catch (error) {
          this.logWarning(`Attempt ${attempt} to seed ${step.name} failed: ${(error as Error).message}`);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to seed ${step.name} after ${MAX_RETRIES} attempts`);
          }
          
          attempt++;
          this.logStep(`Waiting ${RETRY_DELAY_MS}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
  }

  /**
   * Verify seeding results
   */
  private async verifyResults(): Promise<void> {
    this.logStep('Verifying seed results...');
    
    try {
      const userCount = await this.client.query(`SELECT COUNT(*) FROM users WHERE email LIKE '%@example.com'`);
      const shareCount = await this.client.query(`
        SELECT COUNT(*) FROM shares 
        WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@example.com')
      `);
      const transcriptCount = await this.client.query(`
        SELECT COUNT(*) FROM transcripts 
        WHERE share_id IN (
          SELECT id FROM shares 
          WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@example.com')
        )
      `);
      
      this.logStep(`Verification complete: ${userCount.rows[0].count} users, ${shareCount.rows[0].count} shares, ${transcriptCount.rows[0].count} transcripts`);
      
      // Ensure we have at least some data
      if (parseInt(userCount.rows[0].count) === 0 || 
          parseInt(shareCount.rows[0].count) === 0 || 
          parseInt(transcriptCount.rows[0].count) === 0) {
        throw new Error('Verification failed: Some tables have no seed data');
      }
    } catch (error) {
      throw new Error(`Verification failed: ${(error as Error).message}`);
    }
  }

  /**
   * Print timing summary
   */
  private printTimingSummary(): void {
    const totalTime = performance.now() - this.startTime;
    
    console.log('\n=== Seeding Performance ===');
    
    Object.entries(this.stepTimings).forEach(([step, time]) => {
      const percentage = ((time / totalTime) * 100).toFixed(1);
      console.log(`${step.padEnd(15)}: ${this.formatTime(time).padEnd(10)} (${percentage}%)`);
    });
    
    console.log(`${'TOTAL'.padEnd(15)}: ${this.formatTime(totalTime)}`);
    console.log('\n');
  }

  /**
   * Format milliseconds as readable time
   */
  private formatTime(ms: number): string {
    if (ms < 1000) {
      return `${Math.round(ms)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  }

  /**
   * Logging helpers
   */
  private logHeader(message: string): void {
    console.log('\n' + '='.repeat(80));
    console.log(`== ${message}`);
    console.log('='.repeat(80) + '\n');
  }

  private logStep(message: string): void {
    console.log(`[SEED] ${message}`);
  }

  private logStepStart(message: string): void {
    console.log(`\n>> [SEED] ${message}`);
  }

  private logStepComplete(message: string): void {
    console.log(`✅ [SEED] ${message}\n`);
  }

  private logSuccess(message: string): void {
    console.log(`\n✅ [SEED] ${message}`);
  }

  private logWarning(message: string): void {
    console.warn(`⚠️ [SEED] ${message}`);
  }

  private logError(message: string, error: Error): void {
    console.error(`\n❌ [SEED] ${message}`);
    console.error(`${error.name}: ${error.message}`);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(1).join('\n'));
    }
  }
}

// Run the seeder
new CISeedManager().run();