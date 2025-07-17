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
import { YtDlpService } from '../../services/ytdlp.service';
import { sanitizeContent } from '../../utils/content-sanitizer';
import { 
  InstagramUrlParser, 
  InstagramUrlType, 
  UNSUPPORTED_CONTENT_MESSAGES 
} from '../../../content-fetcher/fetchers/instagram/instagram-url.parser';
import { 
  InstagramContentClassifier, 
  InstagramMetadata,
  INSTAGRAM_PROCESSING_STRATEGIES 
} from '../../../content-fetcher/fetchers/instagram/instagram-content-classifier';

/**
 * Instagram Reel content fetcher using oEmbed API and yt-dlp
 * Following TikTok's single-phase pattern for immediate download
 * 
 * NOTE: Only Instagram Reels are supported in MVP
 * Other content types (posts, IGTV, stories) will be rejected
 */
@Injectable()
export class InstagramFetcher extends BaseContentFetcher {
  private readonly classifier: InstagramContentClassifier;

  constructor(
    configService: ConfigService,
    private readonly ytDlpService: YtDlpService,
  ) {
    super(Platform.INSTAGRAM, configService);
    this.classifier = new InstagramContentClassifier();
  }

  /**
   * Check if this fetcher can handle the given URL
   */
  canHandle(url: string): boolean {
    return InstagramUrlParser.isInstagramReel(url);
  }

  /**
   * Fetch Instagram Reel content using yt-dlp directly
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    this.validateUrl(request.url);
    this.logMetrics('fetch_start', { url: request.url });

    try {
      // 1. Validate URL is a Reel
      const urlInfo = InstagramUrlParser.detectContentType(request.url);
      if (!urlInfo.isSupported) {
        const errorMessage = UNSUPPORTED_CONTENT_MESSAGES[urlInfo.type] || 
                           UNSUPPORTED_CONTENT_MESSAGES.unknown;
        throw new FetcherError(
          errorMessage,
          FetcherErrorCode.UNSUPPORTED_CONTENT_TYPE,
          Platform.INSTAGRAM,
          { contentType: urlInfo.type }
        );
      }

      // 2. Use yt-dlp to extract metadata and download video
      this.logger.log(`Extracting Instagram Reel metadata using yt-dlp: ${request.url}`);
      const ytDlpResult = await this.ytDlpService.extractVideoInfo(request.url, true);
      
      if (!ytDlpResult) {
        throw new FetcherError(
          'Failed to extract Instagram Reel information',
          FetcherErrorCode.CONTENT_NOT_FOUND,
          Platform.INSTAGRAM
        );
      }

      // 3. Extract metadata from yt-dlp result
      const metadata: InstagramMetadata = {
        caption: ytDlpResult.description || ytDlpResult.title || '',
        hashtags: this.classifier.extractHashtags(ytDlpResult.description || ''),
        audio_name: '', // yt-dlp doesn't provide audio info for Instagram
        duration: ytDlpResult.duration,
        author_name: ytDlpResult.uploader || '',
      };

      // 4. Classify content
      const contentType = this.classifier.classify(metadata);
      const strategy = INSTAGRAM_PROCESSING_STRATEGIES[contentType];

      this.logger.log(`Instagram Reel classified as: ${contentType}, shouldTranscribe: ${strategy.shouldTranscribe}`);

      // 5. Extract storage information from yt-dlp result
      let storageUrl: string | undefined;
      let storageType: 'local' | 's3' | undefined;
      let duration: number | undefined;
      let fileSize: number | undefined;

      if (strategy.shouldTranscribe) {
        // We already downloaded the video in step 2
        storageUrl = ytDlpResult.storageUrl || ytDlpResult.localPath;
        storageType = ytDlpResult.storageType;
        duration = ytDlpResult.duration;
        fileSize = ytDlpResult.fileSize;

        if (storageUrl) {
          this.logger.log(`Successfully stored Instagram Reel at: ${storageUrl} (${storageType || 'local'})`);
        }
      } else {
        this.logger.log(`Skipping transcription for ${contentType} content`);
        // Even though we downloaded it, we won't transcribe it
      }

      // 6. Build standardized response
      const result: FetchResponse = {
        content: {
          text: sanitizeContent(metadata.caption),
          description: `Reel by @${metadata.author_name}`,
        },
        media: storageUrl ? {
          type: 'video',
          url: storageUrl,              // Local/S3 path, not HTTP URL
          thumbnailUrl: ytDlpResult.thumbnail,
          duration: duration,
          fileSize: fileSize,
          isLocalFile: storageType === 'local',
        } : undefined,
        metadata: {
          platform: Platform.INSTAGRAM,
          platformId: urlInfo.contentId,
          author: sanitizeContent(metadata.author_name),
        },
        platformData: {
          // yt-dlp extracted data
          title: ytDlpResult.title,
          description: ytDlpResult.description,
          uploader: ytDlpResult.uploader,
          uploadDate: ytDlpResult.uploadDate,
          viewCount: ytDlpResult.viewCount,
          // Instagram specific
          reelId: urlInfo.contentId,
          contentType: contentType,
          processingStrategy: strategy,
          hashtags: metadata.hashtags,
          shouldTranscribe: strategy.shouldTranscribe,
          processingPriority: strategy.priority,
          storageUrl: storageUrl,
          storageType: storageType,
          downloadSuccess: !!storageUrl,
        },
        hints: {
          // Use existing hint properties
          language: 'en', // Default, could be detected later
        },
      };

      this.logMetrics('fetch_success', { 
        url: request.url, 
        contentType: contentType,
        downloaded: !!storageUrl 
      });

      return result;
    } catch (error) {
      this.logMetrics('fetch_error', { url: request.url, error: error.message });
      
      if (error instanceof FetcherError) {
        throw error;
      }

      // Handle specific Instagram errors
      if (error.response?.status === 404) {
        throw new FetcherError(
          'Instagram Reel not found or has been deleted',
          FetcherErrorCode.CONTENT_NOT_FOUND,
          Platform.INSTAGRAM
        );
      }

      if (error.response?.status === 403) {
        throw new FetcherError(
          'Instagram Reel is private or access is restricted',
          FetcherErrorCode.CONTENT_PRIVATE,
          Platform.INSTAGRAM
        );
      }

      throw new FetcherError(
        `Failed to fetch Instagram content: ${error.message}`,
        FetcherErrorCode.NETWORK_ERROR,
        Platform.INSTAGRAM,
        { originalError: error }
      );
    }
  }

  // Note: Instagram oEmbed API requires authentication (Facebook App access token)
  // We're using yt-dlp directly instead, which can extract metadata without authentication
}