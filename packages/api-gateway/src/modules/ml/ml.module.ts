import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '../../config/services/config.service';
import { MLProducerEnhancedService } from './ml-producer-enhanced.service';
import { MLAnalyticsService } from './services/ml-analytics.service';
import { MLMetricsService } from './services/ml-metrics.service';
import { EmbeddingService } from './services/embedding.service';
import { MLAnalyticsController } from './controllers/ml-analytics.controller';
import { MLMetricsController } from './controllers/ml-metrics.controller';
import { DatabaseModule } from '../../database/database.module';
import * as Redis from 'ioredis';

@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [MLAnalyticsController, MLMetricsController],
  providers: [
    {
      provide: 'MLProducerService',
      useClass: MLProducerEnhancedService,
    },
    MLProducerEnhancedService,
    MLAnalyticsService,
    MLMetricsService,
    EmbeddingService,
    {
      provide: Redis.Redis,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Redis.Redis({
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        });
      },
    },
  ],
  exports: ['MLProducerService', MLProducerEnhancedService, MLAnalyticsService, MLMetricsService, EmbeddingService],
})
export class MLModule {}