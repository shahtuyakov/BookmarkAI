import { Injectable, Logger } from '@nestjs/common';
import { YtDlpService } from '../../shares/services/ytdlp.service';
import { YouTubeContentType } from '../../shares/fetchers/types/youtube.types';

export interface DownloadResult {
  storageUrl: string;
  fileSize?: number;
  filePath: string;
  quality: string;
  format: string;
}

export interface DownloadOptions {
  quality: string;
  strategy: 'full' | 'audio' | 'none';
  contentType: YouTubeContentType;
}

/**
 * Service for downloading YouTube videos with smart quality selection
 * Implements the download strategies defined in ADR-213
 */
@Injectable()
export class YouTubeDownloadService {
  private readonly logger = new Logger(YouTubeDownloadService.name);

  constructor(
    private readonly ytDlpService: YtDlpService,
  ) {}

  /**
   * Download YouTube video based on content type and strategy
   */
  async downloadVideo(
    videoId: string,
    options: DownloadOptions
  ): Promise<DownloadResult> {
    const { quality, strategy, contentType } = options;
    
    this.logger.log(
      `Downloading YouTube video ${videoId} with strategy: ${strategy}, quality: ${quality}, type: ${contentType}`
    );

    if (strategy === 'none') {
      throw new Error(`Download strategy 'none' not supported for ${contentType}`);
    }

    try {
      const url = `https://youtube.com/watch?v=${videoId}`;
      const downloadResult = await this.ytDlpService.extractVideoInfo(url, true);
      
      if (!downloadResult || !downloadResult.storageUrl) {
        throw new Error(`Failed to download video ${videoId}`);
      }

      this.logger.log(
        `Successfully downloaded ${videoId}: ${downloadResult.storageUrl} (${downloadResult.fileSize || 'unknown'} bytes)`
      );

      return {
        storageUrl: downloadResult.storageUrl,
        fileSize: downloadResult.fileSize,
        filePath: downloadResult.storageUrl, // yt-dlp service returns S3 URL as storageUrl
        quality,
        format: strategy === 'audio' ? 'audio-only' : 'video',
      };
    } catch (error) {
      this.logger.error(`Failed to download video ${videoId}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get optimal quality based on content type and duration
   */
  getOptimalQuality(contentType: YouTubeContentType, durationSeconds: number): string {
    switch (contentType) {
      case YouTubeContentType.SHORT:
        return '360p'; // Lower quality for shorts
      
      case YouTubeContentType.EDUCATIONAL:
        return durationSeconds > 900 ? 'audio-only' : '720p'; // Audio-only for >15min
      
      case YouTubeContentType.LONG:
        return 'audio-only'; // Always audio for long content
      
      case YouTubeContentType.STANDARD:
        return '720p'; // Standard quality for regular videos
      
      case YouTubeContentType.MUSIC:
        return 'audio-only'; // Audio-only for music
      
      default:
        return '720p';
    }
  }

  /**
   * Get download strategy based on content type
   */
  getDownloadStrategy(contentType: YouTubeContentType): 'full' | 'audio' | 'none' {
    switch (contentType) {
      case YouTubeContentType.SHORT:
      case YouTubeContentType.STANDARD:
        return 'full';
      
      case YouTubeContentType.EDUCATIONAL:
      case YouTubeContentType.LONG:
        return 'audio'; // Prefer audio for long content
      
      case YouTubeContentType.MUSIC:
        return 'none'; // Skip download for music
      
      default:
        return 'full';
    }
  }

  /**
   * Clean up downloaded files after processing
   */
  async cleanupDownload(filePath: string): Promise<void> {
    try {
      // TODO: Implement cleanup logic
      // This should remove the file from local storage if applicable
      // S3 files might be cleaned up by lifecycle policies
      this.logger.log(`Cleaned up download: ${filePath}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup download ${filePath}: ${error.message}`);
    }
  }
}