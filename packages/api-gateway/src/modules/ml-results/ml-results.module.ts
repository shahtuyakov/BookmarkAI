import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { HttpModule } from '@nestjs/axios';
import { ML_RESULT_QUEUE } from './queue/ml-result-queue.constants';
import { MLResultListenerProcessor } from './queue/ml-result-listener.processor';
import { MLResultSchedulerService } from './services/ml-result-scheduler.service';
import { DatabaseModule } from '../../database/database.module';
import { ConfigModule } from '../../config/config.module';
import { DrizzleService } from '../../database/services/drizzle.service';
import { MLProducerEnhancedService } from '../ml/ml-producer-enhanced.service';
import { MLMetricsService } from '../ml/services/ml-metrics.service';
import { ConfigService } from '../../config/services/config.service';
import * as Redis from 'ioredis';

@Module({
  imports: [
    BullModule.registerQueue({
      name: ML_RESULT_QUEUE.NAME,
    }),
    DatabaseModule,
    ConfigModule,
    HttpModule,
  ],
  providers: [
    MLResultListenerProcessor,
    MLResultSchedulerService,
    DrizzleService,
    {
      provide: 'MLProducerService',
      useClass: MLProducerEnhancedService,
    },
    MLProducerEnhancedService,
    MLMetricsService,
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
  exports: [],
})
export class MLResultsModule {}