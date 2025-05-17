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

/**
 * Module for share management functionality
 */
@Module({
  imports: [
    // Import AuthModule to access JwtAuthGuard and KmsJwtService
    AuthModule,
    
    // Register BullMQ queue
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
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
    }),
  ],
  controllers: [SharesController],
  providers: [
    SharesService, 
    IdempotencyService,
    ErrorService,
    // Also register ShareProcessor
    require('./queue/share-processor').ShareProcessor
  ],
  exports: [SharesService, IdempotencyService, ErrorService],
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