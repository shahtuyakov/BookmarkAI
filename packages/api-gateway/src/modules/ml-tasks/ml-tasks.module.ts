import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MlTasksService } from './services/ml-tasks.service';
import { CeleryClientService } from './services/celery-client.service';
import { mlTasksConfig } from './config/ml-tasks.config';

@Module({
  imports: [ConfigModule.forFeature(mlTasksConfig)],
  providers: [MlTasksService, CeleryClientService],
  exports: [MlTasksService],
})
export class MlTasksModule {}