import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '../../config/services/config.service';
import { AuthModule } from '../auth/auth.module';
import { DrizzleService } from '../../database/services/drizzle.service';
import { SharesController } from './controllers/shares.controller';
import { MetricsController } from './controllers/metrics.controller';
import { SearchController } from './controllers/search.controller';
import { WorkflowController } from './controllers/workflow.controller';
import { SharesService } from './services/shares.service';
import { IdempotencyService } from './services/idempotency.service';
import { MetricsService } from './services/metrics.service';
import { SearchService } from './services/search.service';
import { WorkflowService } from './services/workflow.service';
import { WorkflowMetricsService } from './services/workflow-metrics.service';
import { VideoWorkflowService } from './services/video-workflow.service';
import { SharesRateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { SHARE_QUEUE } from './queue/share-queue.constants';
import { ErrorService } from './services/error.service';
import { ShareProcessor } from './queue/share-processor';
import { SearchRepository } from './repositories/search.repository';
import { SharesRepository } from './repositories/shares.repository';
import { FetchersModule } from './fetchers/fetchers.module';
import { MLModule } from '../ml/ml.module';
// import { YouTubeModule } from '../youtube/youtube.module'; // Using single processor approach
import { WorkerRateLimiterService } from './services/worker-rate-limiter.service';
import { YouTubeTranscriptService } from './services/youtube-transcript.service';
import * as Redis from 'ioredis';

/**
 * Module for share management functionality
 */
@Module({
  imports: [
    // Import AuthModule to access JwtAuthGuard and KmsJwtService
    AuthModule,

    // Import FetchersModule for content fetching
    FetchersModule,
    
    // Import MLModule for ML task publishing
    MLModule,
    
    // Import YouTubeModule for YouTube-specific processing
    // YouTubeModule, // Removed to use single processor approach

    // Register BullMQ queue with enhanced configuration from ADR
    BullModule.registerQueueAsync({
      name: SHARE_QUEUE.NAME,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('CACHE_HOST', 'localhost'),
          port: configService.get('CACHE_PORT', 6379),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          timeout: configService.get('WORKER_TIMEOUT_MS', 30000),
          removeOnComplete: {
            age: configService.get('COMPLETED_JOB_TTL_SECONDS', 86400), // 24 hours
          },
          removeOnFail: {
            age: configService.get('FAILED_JOB_TTL_SECONDS', 604800), // 7 days
          },
        },
      }),
    }),
  ],
  controllers: [SharesController, MetricsController, SearchController, WorkflowController],
  providers: [
    SharesService,
    IdempotencyService,
    MetricsService,
    SearchService,
    WorkflowService,
    WorkflowMetricsService,
    VideoWorkflowService,
    SearchRepository,
    SharesRepository,
    DrizzleService,
    ErrorService,
    ShareProcessor,
    WorkerRateLimiterService,
    YouTubeTranscriptService,
    {
      provide: Redis.Redis,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Redis.Redis({
          host: configService.get('CACHE_HOST', 'localhost'),
          port: configService.get('CACHE_PORT', 6379),
        });
      },
    },
  ],
  exports: [
    SharesService,
    SharesRepository,
    WorkflowService,
    WorkflowMetricsService,
    IdempotencyService,
    ErrorService,
    SearchService,
  ],
})
export class SharesModule {
  /**
   * Configure middleware
   */
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(SharesRateLimitMiddleware)
      .forRoutes({ path: 'v1/shares', method: RequestMethod.POST });
  }
}
