import { Platform } from '../../constants/platform.enum';
import { FetcherError, FetcherErrorCode } from '../interfaces/fetcher-error.interface';
import { YouTubeErrorCode } from '../types/youtube.types';

/**
 * YouTube-specific error class with enhanced context
 */
export class YouTubeError extends FetcherError {
  constructor(
    message: string,
    code: YouTubeErrorCode,
    public readonly videoId?: string,
    public readonly quotaUsed?: number,
    cause?: Error
  ) {
    // Map YouTube error codes to generic fetcher error codes
    const fetcherCode = YouTubeError.mapToFetcherCode(code);
    super(message, fetcherCode, Platform.YOUTUBE, cause);
    this.name = 'YouTubeError';
    // Store the original YouTube-specific code
    (this as any).youtubeCode = code;
  }

  /**
   * Map YouTube-specific error codes to generic fetcher error codes
   */
  private static mapToFetcherCode(code: YouTubeErrorCode): FetcherErrorCode {
    switch (code) {
      case YouTubeErrorCode.QUOTA_EXCEEDED:
        return FetcherErrorCode.RATE_LIMIT_EXCEEDED;
      case YouTubeErrorCode.VIDEO_NOT_FOUND:
        return FetcherErrorCode.CONTENT_NOT_FOUND;
      case YouTubeErrorCode.VIDEO_PRIVATE:
      case YouTubeErrorCode.VIDEO_RESTRICTED:
        return FetcherErrorCode.CONTENT_PRIVATE;
      case YouTubeErrorCode.INVALID_VIDEO_ID:
        return FetcherErrorCode.INVALID_URL;
      case YouTubeErrorCode.API_KEY_INVALID:
        return FetcherErrorCode.API_UNAVAILABLE;
      case YouTubeErrorCode.DOWNLOAD_FAILED:
      case YouTubeErrorCode.TRANSCRIPTION_FAILED:
      case YouTubeErrorCode.CAPTIONS_UNAVAILABLE:
        return FetcherErrorCode.API_UNAVAILABLE;
      default:
        return FetcherErrorCode.API_UNAVAILABLE;
    }
  }

  /**
   * Create a quota exceeded error
   */
  static quotaExceeded(used: number, limit: number): YouTubeError {
    return new YouTubeError(
      `YouTube API quota exceeded: ${used}/${limit} units used`,
      YouTubeErrorCode.QUOTA_EXCEEDED,
      undefined,
      used
    );
  }

  /**
   * Create a video not found error
   */
  static videoNotFound(videoId: string): YouTubeError {
    return new YouTubeError(
      `YouTube video not found: ${videoId}`,
      YouTubeErrorCode.VIDEO_NOT_FOUND,
      videoId
    );
  }

  /**
   * Create a video private error
   */
  static videoPrivate(videoId: string): YouTubeError {
    return new YouTubeError(
      `YouTube video is private or unlisted: ${videoId}`,
      YouTubeErrorCode.VIDEO_PRIVATE,
      videoId
    );
  }

  /**
   * Create an invalid video ID error
   */
  static invalidVideoId(input: string): YouTubeError {
    return new YouTubeError(
      `Invalid YouTube video ID or URL: ${input}`,
      YouTubeErrorCode.INVALID_VIDEO_ID
    );
  }

  /**
   * Create an API key invalid error
   */
  static apiKeyInvalid(): YouTubeError {
    return new YouTubeError(
      'YouTube API key is invalid or not configured',
      YouTubeErrorCode.API_KEY_INVALID
    );
  }
}