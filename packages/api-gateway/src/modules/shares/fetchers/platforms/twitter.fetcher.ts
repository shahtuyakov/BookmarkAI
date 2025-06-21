import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../../config/services/config.service';
import { Platform } from '../../constants/platform.enum';
import { BaseContentFetcher } from '../base/base-content-fetcher';
import {
  FetchRequest,
  FetchResponse,
} from '../interfaces/content-fetcher.interface';
import {
  FetcherError,
  FetcherErrorCode,
} from '../interfaces/fetcher-error.interface';

/**
 * Twitter/X content fetcher - STUB IMPLEMENTATION
 * Twitter's API requires OAuth and is not available without authentication
 * This is a placeholder that returns an error for all requests
 */
@Injectable()
export class TwitterFetcher extends BaseContentFetcher {
  constructor(configService: ConfigService) {
    // Support both Twitter and X platforms
    super(Platform.TWITTER, configService);
  }

  /**
   * Stub implementation - always throws not implemented error
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    this.validateUrl(request.url);
    this.logMetrics('fetch_start', { url: request.url });

    // Explicit stub - no implementation available
    throw new FetcherError(
      'Twitter/X integration not available. Twitter API requires OAuth authentication which is not currently implemented.',
      FetcherErrorCode.PLATFORM_NOT_IMPLEMENTED,
      this.getPlatformFromUrl(request.url),
      {
        url: request.url,
        message: 'Twitter/X content fetching requires API v2 with OAuth 2.0 authentication',
        futureImplementation: 'Task 2.15 or later phases',
      }
    );
  }

  /**
   * Check if this fetcher can handle the given URL
   */
  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return (
        hostname === 'twitter.com' ||
        hostname === 'www.twitter.com' ||
        hostname === 'x.com' ||
        hostname === 'www.x.com' ||
        hostname === 'mobile.twitter.com' ||
        hostname === 'mobile.x.com'
      );
    } catch {
      return false;
    }
  }

  /**
   * Get platform from URL (Twitter or X)
   */
  getPlatform(): Platform {
    // This fetcher handles both Twitter and X
    return Platform.TWITTER;
  }

  /**
   * Determine specific platform from URL
   */
  private getPlatformFromUrl(url: string): Platform {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      if (hostname.includes('x.com')) {
        return Platform.X;
      }
      return Platform.TWITTER;
    } catch {
      return Platform.TWITTER;
    }
  }
}

/**
 * X.com fetcher - just an alias for TwitterFetcher
 * Both twitter.com and x.com URLs are handled by the same fetcher
 */
@Injectable()
export class XFetcher extends TwitterFetcher {
  constructor(configService: ConfigService) {
    super(configService);
    // Override platform to X
    (this as any).platform = Platform.X;
  }

  /**
   * Get platform
   */
  getPlatform(): Platform {
    return Platform.X;
  }
}