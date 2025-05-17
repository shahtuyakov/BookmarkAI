import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { shares } from '../../../db/schema/shares';
import { SHARE_QUEUE } from './share-queue.constants';
import { eq } from 'drizzle-orm';
import { ShareStatus } from '../constants/share-status.enum';

/**
 * Processor for share background tasks
 * Note: This is a minimal implementation for Phase 1. It will be expanded in Phase 2.
 */
@Processor(SHARE_QUEUE.NAME)
export class ShareProcessor {
  private readonly logger = new Logger(ShareProcessor.name);

  constructor(
    private readonly db: DrizzleService,
  ) {}

  /**
   * Process a share
   * In Phase 1, this just updates the status to 'processing'
   * In Phase 2+, this will integrate with fetchers and ML services
   */
  @Process(SHARE_QUEUE.JOBS.PROCESS)
  async processShare(job: Job<{ shareId: string }>) {
    this.logger.log(`Processing share with ID: ${job.data.shareId}`);
    
    try {
      // Fetch the share data
      const [share] = await this.db.database
        .select()
        .from(shares)
        .where(eq(shares.id, job.data.shareId))
        .limit(1);
      
      if (!share) {
        throw new Error(`Share with ID ${job.data.shareId} not found`);
      }
      
      // Update status to "processing"
      await this.db.database
        .update(shares)
        .set({
          status: ShareStatus.PROCESSING,
          updatedAt: new Date(),
        })
        .where(eq(shares.id, job.data.shareId));
      
      this.logger.log(`Updated share ${job.data.shareId} status to "processing"`);
      
      // In Phase 1, we just update the status
      // In Phase 2, this will trigger content fetchers
      
      // In a real implementation, we would fetch content, extract metadata,
      // then trigger further jobs for AI processing
      
      // For demo purposes, you could add a timeout and then update to DONE
      // setTimeout(async () => {
      //   await this.db.database
      //     .update(shares)
      //     .set({
      //       status: ShareStatus.DONE,
      //       updatedAt: new Date(),
      //     })
      //     .where(eq(shares.id, job.data.shareId));
      //   
      //   this.logger.log(`Updated share ${job.data.shareId} status to "done"`);
      // }, 5000);
      
      return { success: true };
    } catch (error) {
      this.logger.error(`Error processing share ${job.data.shareId}: ${error.message}`, error.stack);
      
      // Update status to "error"
      try {
        await this.db.database
          .update(shares)
          .set({
            status: ShareStatus.ERROR,
            updatedAt: new Date(),
          })
          .where(eq(shares.id, job.data.shareId));
      } catch (updateError) {
        this.logger.error(`Failed to update share status: ${updateError.message}`);
      }
      
      // Re-throw to trigger Bull's retry mechanism
      throw error;
    }
  }
}