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
 * Follows the modular monolith architecture (ADR-001)
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
    // More modules will be added as they're implemented
  ],
})
export class AppModule {
  // Apply rate limiting middleware to auth endpoints
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/refresh', method: RequestMethod.POST }
      );
  }
}