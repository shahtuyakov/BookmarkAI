/**
 * YouTube-specific types and enums for content classification and processing
 */

export enum YouTubeContentType {
  SHORT = 'youtube_short',        // <60s, vertical videos, fast processing
  STANDARD = 'youtube_standard',  // 1-10min, normal processing  
  LONG = 'youtube_long',         // 10+ min, audio-only processing
  MUSIC = 'youtube_music',       // Music content, metadata-focused
  EDUCATIONAL = 'youtube_edu'    // Tutorial/lecture, high-quality transcription
}

export interface YouTubeProcessingStrategy {
  type: YouTubeContentType;
  processingPriority: number;           // 1-10 scale (10 = highest)
  downloadStrategy: 'full' | 'audio' | 'none';
  downloadQuality: '360p' | '720p' | 'audio-only';
  transcriptionStrategy: 'api_captions' | 'whisper_full' | 'whisper_chunked' | 'skip';
  chunkingStrategy?: {
    chunkSize: number;                  // seconds
    overlap: number;                    // seconds
    useChapters: boolean;
  };
  summaryComplexity: 'basic' | 'standard' | 'comprehensive';
  expectedProcessingTime: number;       // seconds
}

export interface YouTubeVideoData {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    tags?: string[];
    categoryId: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
    thumbnails: {
      [key: string]: {
        url: string;
        width: number;
        height: number;
      };
    };
  };
  contentDetails: {
    duration: string;           // ISO 8601 duration format
    caption: string;            // 'true' if captions available
    licensedContent: boolean;
  };
  statistics: {
    viewCount: string;
    likeCount?: string;
    commentCount?: string;
  };
  status: {
    privacyStatus: string;      // 'public', 'private', 'unlisted'
    uploadStatus: string;
  };
  chapters?: Array<{
    time: number;               // start time in seconds
    title: string;
  }>;
}

export interface YouTubeQuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  utilizationPercentage: number;
  resetTime: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export interface YouTubeEnhancementData {
  shareId: string;
  videoId: string;
  processingStrategy: YouTubeProcessingStrategy;
  apiData: YouTubeVideoData;
  priority: number;
}

export interface CaptionData {
  source: 'youtube_api' | 'whisper';
  text: string;
  language: string;
  confidence: number;
  timestamped: boolean;
}

export interface MediaData {
  filePath: string;
  fileSize: number;
  format: string;
  quality: string;
  duration?: number;
  downloadedAt: Date;
}

export interface TranscriptData {
  source: 'youtube_api' | 'whisper';
  text: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  language: string;
  confidence: number;
}

export enum YouTubeErrorCode {
  QUOTA_EXCEEDED = 'YOUTUBE_QUOTA_EXCEEDED',
  VIDEO_NOT_FOUND = 'YOUTUBE_VIDEO_NOT_FOUND',
  VIDEO_PRIVATE = 'YOUTUBE_VIDEO_PRIVATE',
  VIDEO_RESTRICTED = 'YOUTUBE_VIDEO_RESTRICTED',
  INVALID_VIDEO_ID = 'YOUTUBE_INVALID_VIDEO_ID',
  API_KEY_INVALID = 'YOUTUBE_API_KEY_INVALID',
  DOWNLOAD_FAILED = 'YOUTUBE_DOWNLOAD_FAILED',
  TRANSCRIPTION_FAILED = 'YOUTUBE_TRANSCRIPTION_FAILED',
  CAPTIONS_UNAVAILABLE = 'YOUTUBE_CAPTIONS_UNAVAILABLE',
  ENHANCEMENT_QUEUE_FAILED = 'YOUTUBE_ENHANCEMENT_QUEUE_FAILED'
}