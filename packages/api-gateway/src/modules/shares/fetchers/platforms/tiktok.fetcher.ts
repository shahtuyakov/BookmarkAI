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
  RetryableFetcherError,
} from '../interfaces/fetcher-error.interface';
import * as cheerio from 'cheerio';

/**
 * TikTok content fetcher using oEmbed API
 * No authentication required, but limited metadata available
 * 
 * NOTE: Video URL extraction is attempted but often fails due to TikTok's anti-bot measures.
 * For reliable video extraction, consider:
 * 1. Using yt-dlp as a subprocess (most reliable)
 * 2. Using a headless browser with Puppeteer/Playwright
 * 3. Using a specialized TikTok API service
 * 4. Implementing TikTok's official API (requires approval)
 */
@Injectable()
export class TikTokFetcher extends BaseContentFetcher {
  private readonly oembedEndpoint = 'https://www.tiktok.com/oembed';

  constructor(configService: ConfigService) {
    super(Platform.TIKTOK, configService);
  }

  /**
   * Fetch TikTok content using oEmbed API
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    this.validateUrl(request.url);
    this.logMetrics('fetch_start', { url: request.url });

    try {
      // Build oEmbed URL
      const oembedUrl = `${this.oembedEndpoint}?url=${encodeURIComponent(request.url)}`;
      
      // Make request with timeout
      const response = await this.fetchWithTimeout(
        oembedUrl,
        {
          'Accept': 'application/json',
        },
        request.options?.timeout || 5000
      );

      // Handle specific TikTok errors
      if (response.status === 400) {
        const data = response.data;
        if (data?.status_msg?.includes('video is private')) {
          throw new FetcherError(
            'TikTok video is private',
            FetcherErrorCode.CONTENT_PRIVATE,
            Platform.TIKTOK
          );
        }
        throw new FetcherError(
          'Invalid TikTok URL or content unavailable',
          FetcherErrorCode.CONTENT_NOT_FOUND,
          Platform.TIKTOK
        );
      }

      const data = response.data;

      // Validate response structure
      if (!data || typeof data !== 'object') {
        throw new FetcherError(
          'Invalid response from TikTok oEmbed API',
          FetcherErrorCode.API_UNAVAILABLE,
          Platform.TIKTOK,
          { response: data }
        );
      }

      // Try to extract the actual video URL
      let videoUrl: string | undefined;
      try {
        videoUrl = await this.extractVideoUrl(request.url);
        if (videoUrl) {
          this.logger.log(`Successfully extracted video URL for ${request.url}`);
        } else {
          this.logger.warn(
            `Could not extract video URL from TikTok. ` +
            `This is expected due to TikTok's anti-bot measures. ` +
            `Consider using yt-dlp or a specialized service for video extraction.`
          );
        }
      } catch (extractError) {
        this.logger.warn(`Failed to extract video URL: ${extractError.message}`);
      }

      // Build standardized response
      const result: FetchResponse = {
        content: {
          text: data.title || '',
          description: data.author_name ? `Video by @${data.author_name}` : undefined,
        },
        media: {
          type: 'video',
          url: videoUrl, // Now we include the actual video URL!
          thumbnailUrl: data.thumbnail_url,
          // TikTok oEmbed doesn't provide duration
        },
        metadata: {
          author: data.author_name,
          platform: Platform.TIKTOK,
          // Extract video ID from embed HTML if available
          platformId: this.extractVideoId(data.html),
        },
        platformData: {
          ...data,
          extractedVideoUrl: videoUrl, // Include in platform data for debugging
        },
        hints: {
          hasNativeCaptions: true, // TikTok videos often have captions
          requiresAuth: false,
        },
      };

      this.logMetrics('fetch_success', { 
        url: request.url,
        hasMedia: !!result.media?.thumbnailUrl,
        hasVideoUrl: !!result.media?.url,
        hasAuthor: !!result.metadata.author,
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

      // Handle specific error cases
      if (error.response?.status === 429) {
        throw new RetryableFetcherError(
          'TikTok rate limit exceeded',
          FetcherErrorCode.RATE_LIMIT_EXCEEDED,
          Platform.TIKTOK,
          60
        );
      }

      // Generic error
      throw new FetcherError(
        `Failed to fetch TikTok content: ${error.message}`,
        FetcherErrorCode.API_UNAVAILABLE,
        Platform.TIKTOK,
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
        hostname === 'www.tiktok.com' ||
        hostname === 'tiktok.com' ||
        hostname === 'vm.tiktok.com' ||
        hostname === 'm.tiktok.com'
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract video ID from TikTok embed HTML
   */
  private extractVideoId(html?: string): string | undefined {
    if (!html) return undefined;

    // TikTok embed URLs contain the video ID
    // Example: https://www.tiktok.com/embed/v2/1234567890123456789
    const match = html.match(/embed\/v2\/(\d+)/);
    return match?.[1];
  }

  /**
   * Extract video URL from TikTok page
   * This attempts to find the actual video URL by parsing the page
   */
  private async extractVideoUrl(tiktokUrl: string): Promise<string | undefined> {
    try {
      this.logger.log(`Attempting to extract video URL from: ${tiktokUrl}`);
      
      // Fetch the TikTok page
      const response = await this.fetchWithTimeout(
        tiktokUrl,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Cache-Control': 'no-cache',
        },
        10000
      );

      if (!response.data) {
        this.logger.warn('No data received from TikTok page');
        return undefined;
      }

      const html = response.data;
      const $ = cheerio.load(html);
      
      // Try multiple strategies to find video URL
      
      // Strategy 1: Look for __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
      const scriptTags = $('script').toArray();
      for (const scriptTag of scriptTags) {
        const scriptContent = $(scriptTag).html();
        if (scriptContent?.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) {
          try {
            // Extract the JSON data
            const jsonMatch = scriptContent.match(/JSON\.parse\("(.+?)"\)/);
            if (jsonMatch) {
              // Decode the escaped JSON
              const escapedJson = jsonMatch[1];
              const decodedJson = escapedJson.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
              const data = JSON.parse(decodedJson);
              
              // Navigate through the data structure to find video URL
              // TikTok's structure can vary, so we try multiple paths
              const video = data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
              if (video?.video?.downloadAddr) {
                this.logger.log('Found video URL in __UNIVERSAL_DATA_FOR_REHYDRATION__');
                return video.video.downloadAddr;
              }
              if (video?.video?.playAddr) {
                this.logger.log('Found video playAddr in __UNIVERSAL_DATA_FOR_REHYDRATION__');
                return video.video.playAddr;
              }
            }
          } catch (parseError) {
            this.logger.debug(`Failed to parse UNIVERSAL_DATA: ${parseError.message}`);
          }
        }
      }
      
      // Strategy 2: Look for SIGI_STATE
      for (const scriptTag of scriptTags) {
        const scriptContent = $(scriptTag).html();
        if (scriptContent?.includes('window.SIGI_STATE')) {
          try {
            const sigiMatch = scriptContent.match(/window\.SIGI_STATE\s*=\s*({.+?});/);
            if (sigiMatch) {
              const sigiData = JSON.parse(sigiMatch[1]);
              // Find video in ItemModule
              const items = sigiData?.ItemModule;
              if (items) {
                const videoData = Object.values(items)[0] as any;
                if (videoData?.video?.downloadAddr) {
                  this.logger.log('Found video URL in SIGI_STATE');
                  return videoData.video.downloadAddr;
                }
                if (videoData?.video?.playAddr) {
                  this.logger.log('Found video playAddr in SIGI_STATE');
                  return videoData.video.playAddr;
                }
              }
            }
          } catch (parseError) {
            this.logger.debug(`Failed to parse SIGI_STATE: ${parseError.message}`);
          }
        }
      }
      
      // Strategy 3: Look for video meta tags
      const videoUrl = $('meta[property="og:video:secure_url"]').attr('content') ||
                      $('meta[property="og:video:url"]').attr('content') ||
                      $('meta[property="og:video"]').attr('content');
      
      if (videoUrl) {
        this.logger.log('Found video URL in meta tags');
        return videoUrl;
      }
      
      this.logger.warn('Could not extract video URL from TikTok page');
      return undefined;
      
    } catch (error) {
      this.logger.error(`Error extracting TikTok video URL: ${error.message}`);
      return undefined;
    }
  }
}