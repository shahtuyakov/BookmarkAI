import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '../../config/services/config.service';
import { AuthModule } from '../auth/auth.module';
import { DrizzleService } from '../../database/services/drizzle.service';
import { SharesController } from './controllers/shares.controller';
import { MetricsController } from './controllers/metrics.controller';
import { SharesService } from './services/shares.service';
import { IdempotencyService } from './services/idempotency.service';
import { MetricsService } from './services/metrics.service';
import { SharesRateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { SHARE_QUEUE } from './queue/share-queue.constants';
import { ErrorService } from './services/error.service';
import { ShareProcessor } from './queue/share-processor';
import { FetchersModule } from './fetchers/fetchers.module';
import { MLModule } from '../ml/ml.module';

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

    // Register BullMQ queue with enhanced configuration from ADR
    BullModule.registerQueueAsync({
      name: SHARE_QUEUE.NAME,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
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
  controllers: [SharesController, MetricsController],
  providers: [
    SharesService,
    IdempotencyService,
    MetricsService,
    DrizzleService,
    ErrorService,
    ShareProcessor, // Register the processor here
  ],
  exports: [
    SharesService,
    IdempotencyService,
    ErrorService,
    BullModule, // Export BullModule so other modules can access the queue
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
