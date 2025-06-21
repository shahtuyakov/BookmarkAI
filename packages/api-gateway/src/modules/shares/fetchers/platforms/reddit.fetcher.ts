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
 * Reddit content fetcher using JSON endpoints
 * No authentication required for public posts
 */
@Injectable()
export class RedditFetcher extends BaseContentFetcher {
  constructor(configService: ConfigService) {
    super(Platform.REDDIT, configService);
  }

  /**
   * Fetch Reddit content using JSON endpoint
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    this.validateUrl(request.url);
    this.logMetrics('fetch_start', { url: request.url });

    try {
      // Reddit supports .json suffix for API access
      const jsonUrl = this.buildJsonUrl(request.url);
      
      // Make request with custom user agent (Reddit requires this)
      const response = await this.fetchWithTimeout(
        jsonUrl,
        {
          'Accept': 'application/json',
          'User-Agent': this.config.userAgent || 'BookmarkAI/1.0',
        },
        request.options?.timeout || 5000
      );

      // Handle Reddit-specific errors
      if (response.status === 403) {
        throw new FetcherError(
          'Reddit post is private or from a private subreddit',
          FetcherErrorCode.CONTENT_PRIVATE,
          Platform.REDDIT
        );
      }

      const data = response.data;

      // Reddit returns an array with post data
      if (!Array.isArray(data) || data.length === 0) {
        throw new FetcherError(
          'Invalid response from Reddit API',
          FetcherErrorCode.API_UNAVAILABLE,
          Platform.REDDIT,
          { response: data }
        );
      }

      // Extract post data (first item in the first listing)
      const postData = data[0]?.data?.children?.[0]?.data;
      if (!postData) {
        throw new FetcherError(
          'Could not extract post data from Reddit response',
          FetcherErrorCode.CONTENT_NOT_FOUND,
          Platform.REDDIT
        );
      }

      // Build standardized response
      const result: FetchResponse = {
        content: {
          text: postData.title || '',
          description: postData.selftext || undefined,
        },
        media: this.extractMedia(postData),
        metadata: {
          author: postData.author,
          publishedAt: postData.created_utc ? new Date(postData.created_utc * 1000) : undefined,
          platform: Platform.REDDIT,
          platformId: postData.id,
        },
        platformData: postData,
        hints: {
          hasNativeCaptions: false,
          requiresAuth: false,
          language: this.detectLanguage(postData),
        },
      };

      this.logMetrics('fetch_success', { 
        url: request.url,
        hasMedia: !!result.media?.url,
        mediaType: result.media?.type,
        subreddit: postData.subreddit,
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
        `Failed to fetch Reddit content: ${error.message}`,
        FetcherErrorCode.API_UNAVAILABLE,
        Platform.REDDIT,
        error
      );
    }
  }

  /**
   * Check if this fetcher can handle the given URL
   */
  canHandle(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return (
        hostname === 'www.reddit.com' ||
        hostname === 'reddit.com' ||
        hostname === 'old.reddit.com' ||
        hostname === 'np.reddit.com' ||
        hostname.endsWith('.reddit.com')
      );
    } catch {
      return false;
    }
  }

  /**
   * Build JSON API URL from Reddit URL
   */
  private buildJsonUrl(url: string): string {
    // Remove trailing slash if present
    let jsonUrl = url.replace(/\/$/, '');
    
    // Remove query parameters (they can interfere with .json)
    const urlObj = new URL(jsonUrl);
    urlObj.search = '';
    jsonUrl = urlObj.toString();
    
    // Add .json suffix if not present
    if (!jsonUrl.endsWith('.json')) {
      jsonUrl += '.json';
    }
    
    return jsonUrl;
  }

  /**
   * Extract media information from Reddit post data
   */
  private extractMedia(postData: any): FetchResponse['media'] {
    // Check for Reddit video
    if (postData.is_video && postData.media?.reddit_video) {
      return {
        type: 'video',
        url: postData.media.reddit_video.fallback_url,
        thumbnailUrl: postData.thumbnail,
        duration: postData.media.reddit_video.duration,
      };
    }

    // Check for image post
    if (postData.post_hint === 'image' && postData.url) {
      return {
        type: 'image',
        url: postData.url,
        thumbnailUrl: postData.thumbnail,
      };
    }

    // Check for gallery (multiple images)
    if (postData.is_gallery && postData.media_metadata) {
      // For galleries, return the first image
      const firstImageId = Object.keys(postData.media_metadata)[0];
      const firstImage = postData.media_metadata[firstImageId];
      if (firstImage?.s?.u) {
        return {
          type: 'image',
          url: firstImage.s.u.replace(/&amp;/g, '&'),
          thumbnailUrl: firstImage.s.u.replace(/&amp;/g, '&'),
        };
      }
    }

    // Check for external video (YouTube, etc.)
    if (postData.media?.type && postData.media?.oembed) {
      const oembed = postData.media.oembed;
      return {
        type: postData.media.type === 'youtube.com' ? 'video' : 'none',
        thumbnailUrl: oembed.thumbnail_url,
        // Note: We don't have direct video URL for external content
      };
    }

    // No media or text-only post
    return {
      type: 'none',
    };
  }

  /**
   * Attempt to detect language from post data
   */
  private detectLanguage(postData: any): string | undefined {
    // Reddit doesn't provide language info directly
    // This is a placeholder for potential future enhancement
    return undefined;
  }
}