import { Module } from '@nestjs/common';
import { MLProducerService } from './ml-producer.service';
import { MLAnalyticsService } from './services/ml-analytics.service';
import { MLAnalyticsController } from './controllers/ml-analytics.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MLAnalyticsController],
  providers: [MLProducerService, MLAnalyticsService],
  exports: [MLProducerService, MLAnalyticsService],
})
export class MLModule {}