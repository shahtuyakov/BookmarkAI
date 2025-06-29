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
import { YtDlpService } from '../../services/ytdlp.service';

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

  constructor(
    configService: ConfigService,
    private readonly ytDlpService: YtDlpService,
  ) {
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

      // Download the video immediately using yt-dlp
      let videoUrl: string | undefined;
      let storageUrl: string | undefined;
      let storageType: 'local' | 's3' | undefined;
      let duration: number | undefined;
      let fileSize: number | undefined;
      
      try {
        this.logger.log(`Downloading TikTok video for immediate processing: ${request.url}`);
        const ytDlpResult = await this.ytDlpService.extractVideoInfo(request.url, true); // Download video
        
        if (ytDlpResult) {
          videoUrl = ytDlpResult.url;          // Original URL for reference
          storageUrl = ytDlpResult.storageUrl || ytDlpResult.localPath; // Storage location (S3 or local)
          storageType = ytDlpResult.storageType;
          duration = ytDlpResult.duration;
          fileSize = ytDlpResult.fileSize;
          
          if (storageUrl) {
            this.logger.log(`Successfully stored TikTok video at: ${storageUrl} (${storageType || 'local'})`);
          } else {
            this.logger.warn(`Video download completed but no storage location found`);
          }
        } else {
          this.logger.warn(
            `yt-dlp could not download TikTok video. ` +
            `This may be due to TikTok's anti-bot measures or regional restrictions.`
          );
        }
      } catch (extractError) {
        this.logger.warn(`Failed to download TikTok video with yt-dlp: ${extractError.message}`);
      }

      // Build standardized response
      const result: FetchResponse = {
        content: {
          text: data.title || '',
          description: data.author_name ? `Video by @${data.author_name}` : undefined,
        },
        media: {
          type: 'video',
          url: storageUrl || videoUrl,     // Storage location (S3 or local path)
          originalUrl: videoUrl,           // Keep original URL for reference
          thumbnailUrl: data.thumbnail_url,
          duration: duration,              // Duration from yt-dlp
          fileSize: fileSize,              // File size in bytes
          isLocalFile: storageType === 'local',   // Flag to indicate local file vs URL
        },
        metadata: {
          author: data.author_name,
          platform: Platform.TIKTOK,
          // Extract video ID from embed HTML if available
          platformId: this.extractVideoId(data.html),
        },
        platformData: {
          ...data,
          extractedVideoUrl: videoUrl,     // Original extracted URL
          storageUrl: storageUrl,          // Storage location (S3 or local)
          storageType: storageType,        // Storage type indicator
          downloadSuccess: !!storageUrl,   // Download status for debugging
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

}