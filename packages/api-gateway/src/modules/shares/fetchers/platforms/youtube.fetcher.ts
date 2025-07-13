import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../../../config/services/config.service';
import { Platform } from '../../constants/platform.enum';
import { BaseContentFetcher } from '../base/base-content-fetcher';
import {
  FetchRequest,
  FetchResponse,
  FetcherConfig,
} from '../interfaces/content-fetcher.interface';
import { YouTubeContentClassifier } from '../classifiers/youtube-content-classifier';
import { YouTubeQuotaManager } from '../managers/youtube-quota-manager';
import { YouTubeError } from '../errors/youtube.error';
import { 
  YouTubeVideoData, 
  YouTubeProcessingStrategy,
  YouTubeErrorCode
} from '../types/youtube.types';
import { sanitizeContent } from '../../utils/content-sanitizer';
// import { YouTubeEnhancementQueue } from '../../queue/youtube-enhancement-queue.service';

/**
 * YouTube content fetcher with two-phase processing
 * Phase 1: Immediate API fetch with basic metadata (1-2s)
 * Phase 2: Background enhancement with download and transcription (queued)
 */
@Injectable()
export class YouTubeFetcher extends BaseContentFetcher {

  constructor(
    protected readonly configService: ConfigService,
    private readonly quotaManager: YouTubeQuotaManager,
    private readonly classifier: YouTubeContentClassifier,
    // private readonly enhancementQueue: YouTubeEnhancementQueue,
  ) {
    super(Platform.YOUTUBE, configService);
  }

  /**
   * Override loadCredentials to use YOUTUBE_API_KEY instead of FETCHER_YOUTUBE_API_KEY
   */
  protected loadCredentials(): FetcherConfig['credentials'] {
    return {
      apiKey: this.configService.get<string>('YOUTUBE_API_KEY', null),
      oauth: undefined,
      cookies: undefined,
    };
  }

  /**
   * Phase 1: Immediate YouTube API fetch with content classification
   */
  async fetchContent(request: FetchRequest): Promise<FetchResponse> {
    const videoId = this.extractVideoId(request.url);
    this.logMetrics('fetch_start', { videoId });

    try {
      // 1. Check quota availability
      const quotaAvailable = await this.quotaManager.checkQuotaAvailable('videos.list');
      if (!quotaAvailable) {
        const quotaStatus = await this.quotaManager.getQuotaStatus();
        throw YouTubeError.quotaExceeded(quotaStatus.used, quotaStatus.limit);
      }

      // 2. Fetch video data from YouTube API
      const apiData = await this.fetchYouTubeVideoData(videoId);

      // 3. Record quota usage
      await this.quotaManager.recordQuotaUsage('videos.list');

      // 4. Classify content for processing strategy
      const processingStrategy = this.classifier.classifyContent(apiData);

      // 5. Create quick embedding content (used in response)
      this.createQuickEmbeddingContent(apiData, processingStrategy);

      // 6. Queue background enhancement
      // TODO: Enable when enhancement queue is properly integrated
      // await this.enhancementQueue.queueEnhancement({
      //   shareId: request.shareId,
      //   videoId,
      //   processingStrategy,
      //   apiData,
      //   priority: processingStrategy.processingPriority
      // });

      // 7. Return immediate response
      const response = this.createFetchResponse(apiData, processingStrategy, request.url);

      this.logMetrics('fetch_success', {
        videoId,
        contentType: processingStrategy.type,
        duration: apiData.contentDetails.duration,
        processingPriority: processingStrategy.processingPriority
      });

      return response;

    } catch (error) {
      this.logMetrics('fetch_error', { 
        videoId, 
        error: error.message,
        code: error.code || 'UNKNOWN'
      });

      // Re-throw if already a YouTube error
      if (error instanceof YouTubeError) {
        throw error;
      }

      // Handle specific error cases
      if (error.response?.status === 429) {
        throw new YouTubeError(
          'YouTube API rate limit exceeded',
          YouTubeErrorCode.QUOTA_EXCEEDED,
          videoId
        );
      }

      if (error.response?.status === 403) {
        const data = error.response.data;
        if (data?.error?.message?.includes('quota')) {
          throw YouTubeError.quotaExceeded(0, 10000); // Will be updated by quota manager
        }
        if (data?.error?.message?.includes('API key')) {
          throw YouTubeError.apiKeyInvalid();
        }
      }

      // Generic error wrapper
      throw new YouTubeError(
        `Failed to fetch YouTube content: ${error.message}`,
        YouTubeErrorCode.API_KEY_INVALID, // Default error
        videoId,
        undefined,
        error
      );
    }
  }

  /**
   * Fetch video data from YouTube Data API v3
   */
  private async fetchYouTubeVideoData(videoId: string): Promise<YouTubeVideoData> {
    const apiKey = this.config.credentials?.apiKey;
    if (!apiKey) {
      throw YouTubeError.apiKeyInvalid();
    }

    const url = 'https://www.googleapis.com/youtube/v3/videos';
    const params = new URLSearchParams({
      id: videoId,
      part: 'snippet,contentDetails,statistics,status',
      key: apiKey
    });

    const response = await this.fetchWithTimeout(`${url}?${params.toString()}`);
    const data = response.data;

    if (!data.items || data.items.length === 0) {
      throw YouTubeError.videoNotFound(videoId);
    }

    const video = data.items[0];

    // Check if video is accessible
    if (video.status.privacyStatus !== 'public') {
      throw YouTubeError.videoPrivate(videoId);
    }

    // TODO: Fetch chapters if available (requires additional API call)
    // This would be implemented in a future enhancement

    return video;
  }

  /**
   * Create quick embedding content for immediate searchability
   */
  private createQuickEmbeddingContent(
    apiData: YouTubeVideoData,
    strategy: YouTubeProcessingStrategy
  ): string {
    const { snippet, statistics } = apiData;

    // Create rich initial content for embedding
    const parts = [
      snippet.title,
      this.truncateDescription(snippet.description, 500),
      `By ${snippet.channelTitle}`,
      snippet.tags ? snippet.tags.slice(0, 10).join(', ') : '',
      `Duration: ${this.classifier.formatDuration(this.classifier.parseDuration(apiData.contentDetails.duration))}`,
      `Views: ${this.classifier.formatNumber(statistics.viewCount)}`,
      strategy.type.replace('youtube_', '').replace('_', ' ')
    ].filter(Boolean);

    return parts.join('. ');
  }

  /**
   * Create standardized fetch response
   */
  private createFetchResponse(
    apiData: YouTubeVideoData,
    strategy: YouTubeProcessingStrategy,
    originalUrl: string
  ): FetchResponse {
    const { snippet, contentDetails } = apiData;

    return {
      content: {
        text: sanitizeContent(snippet.title),
        description: this.truncateDescription(snippet.description, 1000)
      },
      media: {
        type: 'video',
        url: originalUrl, // YouTube videos will be downloaded in Phase 2
        thumbnailUrl: this.selectBestThumbnail(snippet.thumbnails),
        duration: this.classifier.parseDuration(contentDetails.duration),
        originalUrl
      },
      metadata: {
        author: sanitizeContent(snippet.channelTitle),
        publishedAt: new Date(snippet.publishedAt),
        platform: Platform.YOUTUBE,
        platformId: this.extractVideoId(originalUrl)
      },
      platformData: {
        ...apiData,
        processingStrategy: strategy,
        hasChapters: !!apiData.chapters?.length,
        contentType: strategy.type,
        quickEmbeddingContent: this.createQuickEmbeddingContent(apiData, strategy)
      },
      hints: {
        hasNativeCaptions: contentDetails.caption === 'true',
        language: snippet.defaultLanguage || snippet.defaultAudioLanguage || 'en',
        requiresAuth: false
      }
    };
  }

  /**
   * Check if this fetcher can handle the given URL
   */
  canHandle(url: string): boolean {
    const youtubePattern = 
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    return youtubePattern.test(url);
  }

  /**
   * Extract YouTube video ID from various URL formats
   */
  private extractVideoId(url: string): string {
    const patterns = [
      // Standard YouTube URLs including Shorts
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|shorts\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
      // Direct video ID
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const videoId = match[1];
        // Validate video ID format
        if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          return videoId;
        }
      }
    }

    throw YouTubeError.invalidVideoId(url);
  }

  /**
   * Select the best available thumbnail
   */
  private selectBestThumbnail(thumbnails: YouTubeVideoData['snippet']['thumbnails']): string | undefined {
    // Prefer higher resolution thumbnails
    const priorities = ['maxres', 'high', 'medium', 'default'];
    
    for (const quality of priorities) {
      if (thumbnails[quality]) {
        return thumbnails[quality].url;
      }
    }

    return undefined;
  }

  /**
   * Truncate description to specified length
   */
  private truncateDescription(description: string, maxLength: number): string {
    if (!description) return '';
    
    const sanitized = sanitizeContent(description);
    if (sanitized.length <= maxLength) return sanitized;
    
    // Truncate at word boundary
    const truncated = sanitized.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > maxLength * 0.8 
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

}