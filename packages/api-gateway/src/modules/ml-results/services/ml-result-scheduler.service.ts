import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ML_RESULT_QUEUE } from '../queue/ml-result-queue.constants';

/**
 * Service to schedule periodic ML result checking jobs
 */
@Injectable()
export class MLResultSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(MLResultSchedulerService.name);

  constructor(
    @InjectQueue(ML_RESULT_QUEUE.NAME) private readonly mlResultQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.setupRecurringJobs();
  }

  private async setupRecurringJobs() {
    // Set up job to check for completed transcriptions every 5 seconds
    await this.mlResultQueue.add(
      ML_RESULT_QUEUE.JOBS.CHECK_COMPLETIONS,
      {},
      {
        repeat: {
          cron: ML_RESULT_QUEUE.CRON.CHECK_COMPLETIONS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    this.logger.log('Set up recurring job for checking ML result completions');

    // Set up job to check for timeouts every minute
    await this.mlResultQueue.add(
      ML_RESULT_QUEUE.JOBS.CHECK_TIMEOUTS,
      {},
      {
        repeat: {
          cron: ML_RESULT_QUEUE.CRON.CHECK_TIMEOUTS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
    this.logger.log('Set up recurring job for checking workflow timeouts');
  }
}