import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigService } from '../../config/services/config.service';
import { YOUTUBE_ENHANCEMENT_QUEUE } from './queue/youtube-enhancement-queue.constants';
import { YouTubeEnhancementProcessor } from './queue/youtube-enhancement.processor';
import { YouTubeEnhancementQueue } from './queue/youtube-enhancement-queue.service';
import { YouTubeDownloadService } from './services/youtube-download.service';
import { DrizzleService } from '../../database/services/drizzle.service';
import { MLModule } from '../ml/ml.module';
import { FetchersModule } from '../shares/fetchers/fetchers.module';

/**
 * Module for YouTube-specific content processing
 * Handles Phase 2 YouTube enhancement pipeline
 */
@Module({
  imports: [
    // Register YouTube Enhancement Queue with its own Bull configuration
    BullModule.registerQueueAsync({
      name: YOUTUBE_ENHANCEMENT_QUEUE.NAME,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('CACHE_HOST', 'localhost'),
          port: configService.get('CACHE_PORT', 6379),
        },
        defaultJobOptions: YOUTUBE_ENHANCEMENT_QUEUE.DEFAULT_OPTIONS,
      }),
    }),
    
    // Import ML module for transcription and summarization tasks
    MLModule,
    
    // Import FetchersModule for YtDlpService
    FetchersModule,
  ],
  providers: [
    YouTubeEnhancementProcessor,
    YouTubeEnhancementQueue,
    YouTubeDownloadService,
    DrizzleService,
  ],
  exports: [
    YouTubeEnhancementQueue,
    YouTubeDownloadService,
  ],
})
export class YouTubeModule {}