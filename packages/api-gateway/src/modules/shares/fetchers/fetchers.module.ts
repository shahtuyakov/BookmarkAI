import { Module } from '@nestjs/common';
import { ConfigModule } from '../../../config/config.module';
import { ContentFetcherRegistry } from './content-fetcher.registry';
import {
  TikTokFetcher,
  RedditFetcher,
  TwitterFetcher,
  XFetcher,
  GenericFetcher,
} from './platforms';

/**
 * Module for content fetchers
 * Provides all platform-specific fetchers and the registry
 */
@Module({
  imports: [ConfigModule],
  providers: [
    // Registry
    ContentFetcherRegistry,
    
    // Platform fetchers
    TikTokFetcher,
    RedditFetcher,
    TwitterFetcher,
    XFetcher,
    GenericFetcher,
    
    // Provider for all fetchers array
    {
      provide: 'CONTENT_FETCHERS',
      useFactory: (
        tiktok: TikTokFetcher,
        reddit: RedditFetcher,
        twitter: TwitterFetcher,
        x: XFetcher,
        generic: GenericFetcher,
      ) => [tiktok, reddit, twitter, x, generic],
      inject: [
        TikTokFetcher,
        RedditFetcher,
        TwitterFetcher,
        XFetcher,
        GenericFetcher,
      ],
    },
  ],
  exports: [ContentFetcherRegistry],
})
export class FetchersModule {}