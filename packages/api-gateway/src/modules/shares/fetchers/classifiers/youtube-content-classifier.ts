import { Injectable, Logger } from '@nestjs/common';
import { 
  YouTubeContentType, 
  YouTubeProcessingStrategy, 
  YouTubeVideoData 
} from '../types/youtube.types';

/**
 * YouTube content classifier that determines processing strategy based on video characteristics
 */
@Injectable()
export class YouTubeContentClassifier {
  private readonly logger = new Logger(YouTubeContentClassifier.name);

  /**
   * Classify YouTube content and determine processing strategy
   */
  classifyContent(apiData: YouTubeVideoData): YouTubeProcessingStrategy {
    const duration = this.parseDuration(apiData.contentDetails.duration);
    const title = apiData.snippet.title.toLowerCase();
    const description = apiData.snippet.description.toLowerCase();
    const tags = apiData.snippet.tags || [];
    const categoryId = apiData.snippet.categoryId;

    this.logger.debug(`Classifying YouTube video: ${apiData.id}, duration: ${duration}s, category: ${categoryId}`);

    // Music detection (highest priority)
    if (this.detectMusicContent(categoryId, title, description, tags)) {
      return {
        type: YouTubeContentType.MUSIC,
        processingPriority: 3,
        downloadStrategy: 'none',
        downloadQuality: 'audio-only',
        transcriptionStrategy: 'skip',
        summaryComplexity: 'basic',
        expectedProcessingTime: 5
      };
    }

    // Shorts detection
    if (duration < 60 || title.includes('#shorts') || this.isVerticalVideo(apiData)) {
      return {
        type: YouTubeContentType.SHORT,
        processingPriority: 8,
        downloadStrategy: 'full',
        downloadQuality: '360p',
        transcriptionStrategy: 'whisper_full',
        summaryComplexity: 'basic',
        expectedProcessingTime: 20
      };
    }

    // Educational content detection
    if (this.detectEducationalContent(title, description, tags, categoryId)) {
      const strategy = duration > 900 ? 'audio' : 'full';
      return {
        type: YouTubeContentType.EDUCATIONAL,
        processingPriority: 6,
        downloadStrategy: strategy,
        downloadQuality: strategy === 'audio' ? 'audio-only' : '720p',
        transcriptionStrategy: 'whisper_chunked',
        chunkingStrategy: {
          chunkSize: apiData.chapters?.length > 0 ? 0 : 300, // Use chapters if available
          overlap: 30,
          useChapters: true
        },
        summaryComplexity: 'comprehensive',
        expectedProcessingTime: Math.min(duration * 0.8, 180) // Max 3 minutes
      };
    }

    // Long content (>10 minutes)
    if (duration > 600) {
      return {
        type: YouTubeContentType.LONG,
        processingPriority: 4,
        downloadStrategy: 'audio',
        downloadQuality: 'audio-only',
        transcriptionStrategy: 'whisper_chunked',
        chunkingStrategy: {
          chunkSize: 600,
          overlap: 60,
          useChapters: false
        },
        summaryComplexity: 'standard',
        expectedProcessingTime: Math.min(duration * 0.6, 120) // Max 2 minutes
      };
    }

    // Standard content (default)
    return {
      type: YouTubeContentType.STANDARD,
      processingPriority: 5,
      downloadStrategy: 'full',
      downloadQuality: '720p',
      transcriptionStrategy: 'whisper_full',
      summaryComplexity: 'standard',
      expectedProcessingTime: 45
    };
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Detect if content is music-related
   */
  private detectMusicContent(
    categoryId: string,
    title: string,
    description: string,
    tags: string[]
  ): boolean {
    // YouTube Music category
    if (categoryId === '10') return true;

    // Music keywords in title/description
    const musicKeywords = [
      'official music video',
      'lyrics',
      'album',
      'song',
      'track',
      'artist',
      'official video',
      'music video',
      'audio only',
      'full album'
    ];
    
    const textToSearch = `${title} ${description}`.toLowerCase();

    return musicKeywords.some(keyword => textToSearch.includes(keyword)) ||
           tags.some(tag => tag.toLowerCase().includes('music'));
  }

  /**
   * Detect if content is educational
   */
  private detectEducationalContent(
    title: string,
    description: string,
    tags: string[],
    categoryId: string
  ): boolean {
    // Education category
    if (categoryId === '27') return true;

    // Educational keywords
    const eduKeywords = [
      'tutorial',
      'how to',
      'learn',
      'course',
      'lesson',
      'explained',
      'guide',
      'step by step',
      'walkthrough',
      'lecture',
      'class',
      'training',
      'workshop',
      'masterclass',
      'programming',
      'coding',
      'development',
      'review',
      'analysis'
    ];

    const textToSearch = `${title} ${description}`.toLowerCase();

    return eduKeywords.some(keyword => textToSearch.includes(keyword)) ||
           tags.some(tag => eduKeywords.some(edu => tag.toLowerCase().includes(edu)));
  }

  /**
   * Check if video is likely vertical (Shorts indicator)
   */
  private isVerticalVideo(apiData: YouTubeVideoData): boolean {
    // Check thumbnail dimensions for vertical aspect ratio
    const thumbnail = apiData.snippet.thumbnails.high || 
                     apiData.snippet.thumbnails.medium || 
                     apiData.snippet.thumbnails.default;
    
    if (thumbnail && thumbnail.height > thumbnail.width) {
      return true;
    }

    return false;
  }

  /**
   * Format duration for display
   */
  formatDuration(durationSeconds: number): string {
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Format number for display (e.g., view count)
   */
  formatNumber(num: string | number): string {
    const number = typeof num === 'string' ? parseInt(num, 10) : num;
    if (isNaN(number)) return '0';

    if (number >= 1000000) {
      return `${(number / 1000000).toFixed(1)}M`;
    }
    if (number >= 1000) {
      return `${(number / 1000).toFixed(1)}K`;
    }
    return number.toString();
  }
}