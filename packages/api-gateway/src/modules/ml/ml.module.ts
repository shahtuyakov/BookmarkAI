import { Module } from '@nestjs/common';
import { MLProducerEnhancedService } from './ml-producer-enhanced.service';
import { MLAnalyticsService } from './services/ml-analytics.service';
import { MLMetricsService } from './services/ml-metrics.service';
import { MLAnalyticsController } from './controllers/ml-analytics.controller';
import { MLMetricsController } from './controllers/ml-metrics.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MLAnalyticsController, MLMetricsController],
  providers: [
    {
      provide: 'MLProducerService',
      useClass: MLProducerEnhancedService,
    },
    MLProducerEnhancedService,
    MLAnalyticsService,
    MLMetricsService,
  ],
  exports: ['MLProducerService', MLProducerEnhancedService, MLAnalyticsService, MLMetricsService],
})
export class MLModule {}