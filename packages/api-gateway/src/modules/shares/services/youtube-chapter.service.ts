import { Injectable, Logger } from '@nestjs/common';
import { YouTubeVideoData } from '../fetchers/types/youtube.types';

export interface ChapterData {
  startSeconds: number;
  endSeconds?: number;
  title: string;
  order: number;
  transcriptSegment?: string;
}

export interface ChapterExtractionResult {
  chapters: ChapterData[];
  hasChapters: boolean;
  extractionMethod: 'description_timestamps' | 'youtube_api' | 'none';
  totalDuration: number;
}

/**
 * Service for extracting and processing YouTube video chapters
 * Supports multiple extraction methods with fallbacks
 */
@Injectable()
export class YouTubeChapterService {
  private readonly logger = new Logger(YouTubeChapterService.name);

  /**
   * Extract chapters from YouTube video data
   * Uses multiple methods with fallbacks
   */
  async extractChapters(
    videoData: YouTubeVideoData,
    transcript?: string
  ): Promise<ChapterExtractionResult> {
    const duration = this.parseDurationToSeconds(videoData.contentDetails.duration);
    
    // Apply thresholds from ADR-213
    if (duration < 300) { // Less than 5 minutes
      this.logger.debug(`Video ${videoData.id} too short for chapters (${duration}s < 300s)`);
      return this.createEmptyResult(duration);
    }

    let result: ChapterExtractionResult;

    // Method 1: Try YouTube API chapters (if available)
    if (videoData.chapters && videoData.chapters.length >= 2) {
      result = this.extractFromYouTubeAPI(videoData.chapters, duration);
      if (result.hasChapters) {
        this.logger.log(`Extracted ${result.chapters.length} chapters from YouTube API for video ${videoData.id}`);
        return result;
      }
    }

    // Method 2: Extract from video description timestamps
    const descriptionChapters = this.extractFromDescription(videoData.snippet.description, duration);
    if (descriptionChapters.hasChapters) {
      result = descriptionChapters;
      this.logger.log(`Extracted ${result.chapters.length} chapters from description for video ${videoData.id}`);
    } else {
      result = this.createEmptyResult(duration);
      this.logger.debug(`No chapters found for video ${videoData.id}`);
    }

    // Add transcript segments if available
    if (result.hasChapters && transcript) {
      result.chapters = this.addTranscriptSegments(result.chapters, transcript);
    }

    return result;
  }

  /**
   * Extract chapters from YouTube API data
   */
  private extractFromYouTubeAPI(chapters: any[], duration: number): ChapterExtractionResult {
    const chapterData: ChapterData[] = chapters.map((chapter, index) => {
      const startSeconds = chapter.time;
      const endSeconds = index < chapters.length - 1 ? chapters[index + 1].time : duration;
      
      return {
        startSeconds,
        endSeconds,
        title: this.sanitizeChapterTitle(chapter.title),
        order: index + 1
      };
    });

    return {
      chapters: chapterData,
      hasChapters: chapterData.length >= 2,
      extractionMethod: 'youtube_api',
      totalDuration: duration
    };
  }

  /**
   * Extract chapters from video description using timestamp patterns
   */
  private extractFromDescription(description: string, duration: number): ChapterExtractionResult {
    if (!description) {
      return this.createEmptyResult(duration);
    }

    const timestampPatterns = [
      // 0:00 Chapter Title
      /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/gm,
      // [0:00] Chapter Title
      /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s+(.+)$/gm,
      // 0:00 - Chapter Title
      /^(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—]\s*(.+)$/gm,
      // Chapter Title - 0:00
      /^(.+)\s*[-–—]\s*(\d{1,2}:\d{2}(?::\d{2})?)$/gm
    ];

    const chapters: ChapterData[] = [];
    
    for (const pattern of timestampPatterns) {
      pattern.lastIndex = 0; // Reset regex
      let match: RegExpExecArray | null;
      
      while ((match = pattern.exec(description)) !== null) {
        const [, timeOrTitle, titleOrTime] = match;
        
        // Determine which capture group is time vs title
        const isFirstGroupTime = /^\d{1,2}:\d{2}/.test(timeOrTitle);
        const timeStr = isFirstGroupTime ? timeOrTitle : titleOrTime;
        const title = isFirstGroupTime ? titleOrTime : timeOrTitle;
        
        const startSeconds = this.parseTimestampToSeconds(timeStr);
        
        if (startSeconds !== null && title && title.length > 0) {
          chapters.push({
            startSeconds,
            title: this.sanitizeChapterTitle(title),
            order: chapters.length + 1
          });
        }
      }
      
      // If we found chapters with this pattern, use them
      if (chapters.length >= 2) {
        break;
      } else {
        chapters.length = 0; // Clear and try next pattern
      }
    }

    // Sort by start time and add end times
    if (chapters.length >= 2) {
      chapters.sort((a, b) => a.startSeconds - b.startSeconds);
      
      for (let i = 0; i < chapters.length; i++) {
        chapters[i].order = i + 1;
        chapters[i].endSeconds = i < chapters.length - 1 ? chapters[i + 1].startSeconds : duration;
      }

      // Validate chapters
      const validChapters = this.validateChapters(chapters, duration);
      
      return {
        chapters: validChapters,
        hasChapters: validChapters.length >= 2,
        extractionMethod: 'description_timestamps',
        totalDuration: duration
      };
    }

    return this.createEmptyResult(duration);
  }

  /**
   * Add transcript segments to chapters
   */
  private addTranscriptSegments(chapters: ChapterData[], transcript: string): ChapterData[] {
    // This is a simplified implementation
    // In a full implementation, you'd parse VTT timestamp data to map text to time ranges
    
    const lines = transcript.split('\n').filter(line => line.trim());
    const avgLinesPerChapter = Math.floor(lines.length / chapters.length);
    
    return chapters.map((chapter, index) => {
      const startLineIndex = index * avgLinesPerChapter;
      const endLineIndex = Math.min((index + 1) * avgLinesPerChapter, lines.length);
      const segmentLines = lines.slice(startLineIndex, endLineIndex);
      
      return {
        ...chapter,
        transcriptSegment: segmentLines.join(' ').substring(0, 2000) // Limit segment size
      };
    });
  }

  /**
   * Validate chapters meet quality requirements
   */
  private validateChapters(chapters: ChapterData[], totalDuration: number): ChapterData[] {
    const CHAPTER_THRESHOLDS = {
      MIN_CHAPTERS: 2,
      MAX_CHAPTERS: 50,
      MIN_CHAPTER_DURATION: 30, // 30 seconds
      MAX_TITLE_LENGTH: 500
    };

    return chapters.filter((chapter, index) => {
      const duration = chapter.endSeconds ? chapter.endSeconds - chapter.startSeconds : 
                      totalDuration - chapter.startSeconds;
      
      // Check minimum duration
      if (duration < CHAPTER_THRESHOLDS.MIN_CHAPTER_DURATION) {
        this.logger.debug(`Chapter ${index + 1} too short: ${duration}s`);
        return false;
      }
      
      // Check title quality
      if (!chapter.title || chapter.title.length > CHAPTER_THRESHOLDS.MAX_TITLE_LENGTH) {
        this.logger.debug(`Chapter ${index + 1} has invalid title`);
        return false;
      }
      
      return true;
    }).slice(0, CHAPTER_THRESHOLDS.MAX_CHAPTERS); // Limit max chapters
  }

  /**
   * Parse timestamp string to seconds
   */
  private parseTimestampToSeconds(timestamp: string): number | null {
    const patterns = [
      /^(\d{1,2}):(\d{2})$/, // m:ss
      /^(\d{1,2}):(\d{2}):(\d{2})$/ // h:mm:ss
    ];

    for (const pattern of patterns) {
      const match = timestamp.match(pattern);
      if (match) {
        if (match.length === 3) {
          // m:ss format
          const minutes = parseInt(match[1], 10);
          const seconds = parseInt(match[2], 10);
          return minutes * 60 + seconds;
        } else if (match.length === 4) {
          // h:mm:ss format
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          return hours * 3600 + minutes * 60 + seconds;
        }
      }
    }

    return null;
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDurationToSeconds(duration: string): number {
    // Parse PT12M44S format
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Sanitize chapter title
   */
  private sanitizeChapterTitle(title: string): string {
    return title
      .trim()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 500);
  }

  /**
   * Create empty result
   */
  private createEmptyResult(duration: number): ChapterExtractionResult {
    return {
      chapters: [],
      hasChapters: false,
      extractionMethod: 'none',
      totalDuration: duration
    };
  }
}