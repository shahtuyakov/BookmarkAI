import { Module } from '@nestjs/common';
import { MLProducerService } from './ml-producer.service';
import { MLAnalyticsService } from './services/ml-analytics.service';
import { MLMetricsService } from './services/ml-metrics.service';
import { MLAnalyticsController } from './controllers/ml-analytics.controller';
import { MLMetricsController } from './controllers/ml-metrics.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MLAnalyticsController, MLMetricsController],
  providers: [MLProducerService, MLAnalyticsService, MLMetricsService],
  exports: [MLProducerService, MLAnalyticsService, MLMetricsService],
})
export class MLModule {}