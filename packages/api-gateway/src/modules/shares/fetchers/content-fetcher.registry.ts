import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { Platform } from '../constants/platform.enum';
import { ContentFetcherInterface } from './interfaces/content-fetcher.interface';
import { FetcherError, FetcherErrorCode } from './interfaces/fetcher-error.interface';

/**
 * Registry for content fetchers
 * Manages fetcher instances and routes requests to appropriate fetchers
 */
@Injectable()
export class ContentFetcherRegistry {
  private readonly logger = new Logger(ContentFetcherRegistry.name);
  private readonly fetchers = new Map<Platform, ContentFetcherInterface>();
  private readonly enabledPlatforms: Set<Platform>;

  constructor(
    @Inject('CONTENT_FETCHERS') fetchers: ContentFetcherInterface[],
    private readonly configService: ConfigService
  ) {
    // Register all fetchers
    fetchers.forEach((fetcher) => this.register(fetcher));

    // Load enabled platforms for compliance
    this.enabledPlatforms = new Set(
      this.configService
        .get<string>('ENABLED_PLATFORMS', 'tiktok,reddit,twitter,x,youtube,instagram,generic')
        .split(',')
        .map((p) => p.trim() as Platform)
    );

    this.logger.log(
      `Registry initialized with ${this.fetchers.size} fetchers. Enabled platforms: ${Array.from(
        this.enabledPlatforms
      ).join(', ')}`
    );
  }

  /**
   * Register a fetcher in the registry
   */
  private register(fetcher: ContentFetcherInterface): void {
    const platform = fetcher.getPlatform();
    
    if (this.fetchers.has(platform)) {
      this.logger.warn(
        `Overwriting existing fetcher for platform: ${platform}`
      );
    }

    this.fetchers.set(platform, fetcher);
    this.logger.debug(`Registered fetcher for platform: ${platform}`);
  }

  /**
   * Get a fetcher for the specified platform
   * Falls back to generic fetcher if platform-specific fetcher is not available
   */
  getFetcher(platform: Platform): ContentFetcherInterface {
    // Check if platform is enabled (compliance)
    if (!this.enabledPlatforms.has(platform) && platform !== Platform.GENERIC) {
      this.logger.warn(
        `Platform ${platform} is disabled. Falling back to generic fetcher.`
      );
      return this.getGenericFetcher();
    }

    const fetcher = this.fetchers.get(platform);
    if (!fetcher) {
      this.logger.warn(
        `No fetcher found for platform: ${platform}. Falling back to generic fetcher.`
      );
      return this.getGenericFetcher();
    }

    return fetcher;
  }

  /**
   * Get a fetcher that can handle the given URL
   * This is useful when platform detection might not be accurate
   */
  getFetcherForUrl(url: string): ContentFetcherInterface {
    // Try each fetcher to see if it can handle the URL
    for (const [platform, fetcher] of this.fetchers) {
      if (this.enabledPlatforms.has(platform) && fetcher.canHandle(url)) {
        return fetcher;
      }
    }

    // Fall back to generic fetcher
    return this.getGenericFetcher();
  }

  /**
   * Get the generic OpenGraph fetcher
   * This is used as a fallback for unsupported platforms
   */
  private getGenericFetcher(): ContentFetcherInterface {
    const genericFetcher = this.fetchers.get(Platform.GENERIC);
    
    if (!genericFetcher) {
      throw new FetcherError(
        'Generic fetcher not available',
        FetcherErrorCode.PLATFORM_NOT_IMPLEMENTED,
        Platform.GENERIC
      );
    }

    return genericFetcher;
  }

  /**
   * Check if a platform is enabled
   */
  isPlatformEnabled(platform: Platform): boolean {
    return this.enabledPlatforms.has(platform);
  }

  /**
   * Get list of all registered platforms
   */
  getRegisteredPlatforms(): Platform[] {
    return Array.from(this.fetchers.keys());
  }

  /**
   * Get list of enabled platforms
   */
  getEnabledPlatforms(): Platform[] {
    return Array.from(this.enabledPlatforms);
  }

  /**
   * Get rate limit configuration for a platform
   */
  getRateLimitConfig(platform: Platform): { max: number; duration: number } {
    const rateLimits = {
      [Platform.TIKTOK]: { max: 60, duration: 60000 },    // 60/min
      [Platform.REDDIT]: { max: 60, duration: 60000 },    // 60/min
      [Platform.TWITTER]: { max: 300, duration: 900000 }, // 300/15min (if implemented)
      [Platform.X]: { max: 300, duration: 900000 },       // 300/15min (if implemented)
      [Platform.YOUTUBE]: { max: 100, duration: 60000 },  // 100/min (conservative for API quota)
      [Platform.INSTAGRAM]: { max: 200, duration: 3600000 }, // 200/hour
      [Platform.GENERIC]: { max: 120, duration: 60000 },  // 120/min
      [Platform.UNKNOWN]: { max: 30, duration: 60000 },   // 30/min (conservative)
    };

    return rateLimits[platform] || rateLimits[Platform.UNKNOWN];
  }
}