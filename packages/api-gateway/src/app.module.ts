import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';

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
    // More modules will be added as they're implemented
  ],
})
export class AppModule {}
