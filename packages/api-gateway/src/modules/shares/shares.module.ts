import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharesController } from './controllers/shares.controller';
import { SharesService } from './services/shares.service';
import { IdempotencyService } from './services/idempotency.service';
import { SharesRateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { SHARE_QUEUE } from './queue/share-queue.constants';
import { ConfigService } from '../../config/services/config.service';
import { AuthModule } from '../auth/auth.module';
import { ErrorService } from './services/error.service';
import { ShareProcessor } from './queue/share-processor';

/**
 * Module for share management functionality
 */
@Module({
  imports: [
    // Import AuthModule to access JwtAuthGuard and KmsJwtService
    AuthModule,
    
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
            age: configService.get('COMPLETED_JOB_TTL_SECONDS', 86400) // 24 hours
          },
          removeOnFail: { 
            age: configService.get('FAILED_JOB_TTL_SECONDS', 604800) // 7 days
          },
        },
      }),
    }),
  ],
  controllers: [SharesController],
  providers: [
    SharesService, 
    IdempotencyService,
    ErrorService,
    ShareProcessor // Register the processor here
  ],
  exports: [
    SharesService, 
    IdempotencyService, 
    ErrorService,
    BullModule // Export BullModule so other modules can access the queue
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