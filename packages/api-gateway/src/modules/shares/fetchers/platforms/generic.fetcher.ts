import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
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
 * Generic OpenGraph content fetcher
 * Falls back for any URL not handled by platform-specific fetchers
 * Extracts OpenGraph and standard meta tags
 */
@Injectable()
export class GenericFetcher extends BaseContentFetcher {
  constructor(configService: ConfigService) {
    super(Platform.GENERIC, configService);
  }

  /**
   * Fetch content using OpenGraph and meta tags
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    this.validateUrl(request.url);
    this.logMetrics('fetch_start', { url: request.url });

    try {
      // Fetch HTML content
      const response = await this.fetchWithTimeout(
        request.url,
        {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        request.options?.timeout || 10000
      );

      // Check if we got HTML
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new FetcherError(
          'URL does not return HTML content',
          FetcherErrorCode.INVALID_URL,
          Platform.GENERIC,
          { contentType }
        );
      }

      // Parse HTML
      const $ = cheerio.load(response.data);
      
      // Extract metadata
      const metadata = this.extractMetadata($);
      
      // Build standardized response
      const result: FetchResponse = {
        content: {
          text: metadata.title || metadata.ogTitle || '',
          description: metadata.description || metadata.ogDescription || undefined,
        },
        media: this.extractMedia(metadata),
        metadata: {
          author: metadata.author || metadata.ogSiteName,
          publishedAt: metadata.publishedTime ? new Date(metadata.publishedTime) : undefined,
          platform: Platform.GENERIC,
        },
        platformData: {
          url: request.url,
          ...metadata,
        },
        hints: {
          hasNativeCaptions: false,
          requiresAuth: false,
          language: metadata.language,
        },
      };

      this.logMetrics('fetch_success', { 
        url: request.url,
        hasOgTags: !!(metadata.ogTitle || metadata.ogDescription),
        hasMedia: !!result.media?.url,
      });

      return result;
    } catch (error) {
      this.logMetrics('fetch_error', { 
        url: request.url,
        error: error.message,
        code: error.code || 'UNKNOWN',
      });

      // Re-throw if already a FetcherError
      if (error instanceof FetcherError) {
        throw error;
      }

      // Generic error
      throw new FetcherError(
        `Failed to fetch content: ${error.message}`,
        FetcherErrorCode.API_UNAVAILABLE,
        Platform.GENERIC,
        error
      );
    }
  }

  /**
   * Generic fetcher can handle any URL
   */
  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // Accept HTTP and HTTPS URLs
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Extract metadata from HTML
   */
  private extractMetadata($: cheerio.CheerioAPI): Record<string, string> {
    const metadata: Record<string, string> = {};

    // Standard meta tags
    metadata.title = $('title').text().trim();
    metadata.description = $('meta[name="description"]').attr('content') || '';
    metadata.author = $('meta[name="author"]').attr('content') || '';
    metadata.language = $('html').attr('lang') || $('meta[property="og:locale"]').attr('content') || '';

    // OpenGraph tags
    $('meta[property^="og:"]').each((_, element) => {
      const property = $(element).attr('property');
      const content = $(element).attr('content');
      if (property && content) {
        const key = property.replace('og:', 'og');
        // Convert og:title to ogTitle for camelCase consistency
        const camelKey = key.replace(/[-:]([a-z])/g, (_, letter) => letter.toUpperCase());
        metadata[camelKey] = content;
      }
    });

    // Twitter Card tags as fallback
    $('meta[name^="twitter:"]').each((_, element) => {
      const name = $(element).attr('name');
      const content = $(element).attr('content');
      if (name && content && !metadata[name.replace('twitter:', '')]) {
        metadata[name.replace('twitter:', 'twitter')] = content;
      }
    });

    // Article metadata
    metadata.publishedTime = 
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[name="publish_date"]').attr('content') ||
      $('time[datetime]').attr('datetime') || '';

    // JSON-LD structured data
    const jsonLd = $('script[type="application/ld+json"]').text();
    if (jsonLd) {
      try {
        const structured = JSON.parse(jsonLd);
        if (structured['@type'] === 'Article' || structured['@type'] === 'NewsArticle') {
          metadata.structuredData = JSON.stringify(structured);
          metadata.author = metadata.author || structured.author?.name;
          metadata.publishedTime = metadata.publishedTime || structured.datePublished;
        }
      } catch {
        // Ignore JSON-LD parsing errors
      }
    }

    return metadata;
  }

  /**
   * Extract media information from metadata
   */
  private extractMedia(metadata: Record<string, string>): FetchResponse['media'] {
    // Check for video
    if (metadata.ogType === 'video' || metadata.ogVideo) {
      return {
        type: 'video',
        url: metadata.ogVideo,
        thumbnailUrl: metadata.ogImage,
      };
    }

    // Check for audio
    if (metadata.ogType === 'music' || metadata.ogAudio) {
      return {
        type: 'audio',
        url: metadata.ogAudio,
        thumbnailUrl: metadata.ogImage,
      };
    }

    // Check for image
    if (metadata.ogImage) {
      return {
        type: 'image',
        url: metadata.ogImage,
        thumbnailUrl: metadata.ogImage,
      };
    }

    // Twitter fallback
    if (metadata.twitterImage) {
      return {
        type: 'image',
        url: metadata.twitterImage,
        thumbnailUrl: metadata.twitterImage,
      };
    }

    return {
      type: 'none',
    };
  }
}