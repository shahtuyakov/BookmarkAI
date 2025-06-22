import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MlTasksService } from './services/ml-tasks.service';
import { mlTasksConfig } from './config/ml-tasks.config';

@Module({
  imports: [ConfigModule.forFeature(mlTasksConfig)],
  providers: [MlTasksService],
  exports: [MlTasksService],
})
export class MlTasksModule {}