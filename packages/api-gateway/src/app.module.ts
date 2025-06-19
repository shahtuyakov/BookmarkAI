import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { SharesModule } from './modules/shares/shares.module';
import { RateLimitMiddleware } from './modules/auth/middlewares/rate-limit.middleware';
import { ConfigService } from './config/services/config.service';

/**
 * Root module for BookmarkAI API Gateway
 */
@Module({
  imports: [
    // Core infrastructure modules
    ConfigModule,
    DatabaseModule,

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
