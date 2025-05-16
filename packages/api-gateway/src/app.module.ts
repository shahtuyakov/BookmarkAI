import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RateLimitMiddleware } from './modules/auth/middlewares/rate-limit.middleware';

/**
 * Root module for BookmarkAI API Gateway
 * Follows the modular monolith architecture (ADR-001)
 */
@Module({
  imports: [
    // Core infrastructure modules
    ConfigModule,
    DatabaseModule,

    // Feature modules
    HealthModule,
    AuthModule,
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