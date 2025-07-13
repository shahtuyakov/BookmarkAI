import { Module } from '@nestjs/common';
import { ConfigModule } from '../../../config/config.module';
import { ContentFetcherRegistry } from './content-fetcher.registry';
import {
  TikTokFetcher,
  RedditFetcher,
  TwitterFetcher,
  XFetcher,
  GenericFetcher,
  YouTubeFetcher,
} from './platforms';
import { YtDlpService } from '../services/ytdlp.service';
import { S3StorageService } from '../services/s3-storage.service';
import { YouTubeContentClassifier } from './classifiers/youtube-content-classifier';
import { YouTubeQuotaManager } from './managers/youtube-quota-manager';
// import { YouTubeEnhancementQueue } from '../queue/youtube-enhancement-queue.service';
// import { YOUTUBE_ENHANCEMENT_QUEUE } from '../queue/youtube-enhancement-queue.constants';

/**
 * Module for content fetchers
 * Provides all platform-specific fetchers and the registry
 */
@Module({
  imports: [ConfigModule],
  providers: [
    // Registry
    ContentFetcherRegistry,
    
    // Services
    YtDlpService,
    S3StorageService,
    
    // YouTube services
    YouTubeContentClassifier,
    YouTubeQuotaManager,
    // YouTubeEnhancementQueue, // TODO: Move to shares module to avoid circular dependencies
    
    // Platform fetchers
    TikTokFetcher,
    RedditFetcher,
    TwitterFetcher,
    XFetcher,
    GenericFetcher,
    YouTubeFetcher,
    
    // Provider for all fetchers array
    {
      provide: 'CONTENT_FETCHERS',
      useFactory: (
        tiktok: TikTokFetcher,
        reddit: RedditFetcher,
        twitter: TwitterFetcher,
        x: XFetcher,
        generic: GenericFetcher,
        youtube: YouTubeFetcher,
      ) => [tiktok, reddit, twitter, x, generic, youtube],
      inject: [
        TikTokFetcher,
        RedditFetcher,
        TwitterFetcher,
        XFetcher,
        GenericFetcher,
        YouTubeFetcher,
      ],
    },
  ],
  exports: [ContentFetcherRegistry],
})
export class FetchersModule {}