import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { SharesModule } from './modules/shares/shares.module';
import { MLModule } from './modules/ml/ml.module';
import { MLResultsModule } from './modules/ml-results/ml-results.module';
import { RateLimitMiddleware } from './modules/auth/middlewares/rate-limit.middleware';
import { ConfigService } from './config/services/config.service';
import { RateLimiterModule } from './common/rate-limiter/rate-limiter.module';

/**
 * Root module for BookmarkAI API Gateway
 */
@Module({
  imports: [
    // Core infrastructure modules
    ConfigModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    RateLimiterModule, // Worker-level distributed rate limiting

    // Register BullMQ for queue management
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
    }),

    // Feature modules
    HealthModule,
    AuthModule,
    SharesModule,
    MLModule,
    // MLResultsModule, // Temporarily disabled due to circular dependency
  ],
})
export class AppModule {
  // Apply middleware
  configure(consumer: MiddlewareConsumer) {
    // Apply rate limiting middleware to auth endpoints
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        { path: 'v1/auth/login', method: RequestMethod.POST },
        { path: 'v1/auth/register', method: RequestMethod.POST },
        { path: 'v1/auth/refresh', method: RequestMethod.POST },
      );
  }
}
