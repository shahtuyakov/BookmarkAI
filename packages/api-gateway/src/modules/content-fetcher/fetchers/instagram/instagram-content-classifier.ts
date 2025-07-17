import { Injectable, Logger } from '@nestjs/common';

export enum InstagramContentType {
  INSTAGRAM_REEL_STANDARD = 'instagram_reel_standard',
  INSTAGRAM_REEL_MUSIC = 'instagram_reel_music',
  INSTAGRAM_REEL_TUTORIAL = 'instagram_reel_tutorial',
  INSTAGRAM_REEL_MEME = 'instagram_reel_meme',
  INSTAGRAM_REEL_DANCE = 'instagram_reel_dance',
}

export interface InstagramProcessingStrategy {
  type: InstagramContentType;
  priority: number;
  downloadStrategy: 'audio' | 'none';
  transcriptionStrategy: 'whisper_full' | 'skip';
  summaryComplexity: 'basic' | 'standard' | 'comprehensive';
  shouldTranscribe: boolean;
}

export interface InstagramMetadata {
  caption: string;
  hashtags: string[];
  audio_name?: string;
  duration?: number;
  author_name: string;
}

export const INSTAGRAM_PROCESSING_STRATEGIES: Record<InstagramContentType, InstagramProcessingStrategy> = {
  [InstagramContentType.INSTAGRAM_REEL_STANDARD]: {
    type: InstagramContentType.INSTAGRAM_REEL_STANDARD,
    priority: 7,
    downloadStrategy: 'audio',
    transcriptionStrategy: 'whisper_full',
    summaryComplexity: 'standard',
    shouldTranscribe: true,
  },
  [InstagramContentType.INSTAGRAM_REEL_MUSIC]: {
    type: InstagramContentType.INSTAGRAM_REEL_MUSIC,
    priority: 2,
    downloadStrategy: 'none',
    transcriptionStrategy: 'skip',
    summaryComplexity: 'basic',
    shouldTranscribe: false,
  },
  [InstagramContentType.INSTAGRAM_REEL_TUTORIAL]: {
    type: InstagramContentType.INSTAGRAM_REEL_TUTORIAL,
    priority: 9,
    downloadStrategy: 'audio',
    transcriptionStrategy: 'whisper_full',
    summaryComplexity: 'comprehensive',
    shouldTranscribe: true,
  },
  [InstagramContentType.INSTAGRAM_REEL_MEME]: {
    type: InstagramContentType.INSTAGRAM_REEL_MEME,
    priority: 5,
    downloadStrategy: 'audio',
    transcriptionStrategy: 'whisper_full',
    summaryComplexity: 'basic',
    shouldTranscribe: true,
  },
  [InstagramContentType.INSTAGRAM_REEL_DANCE]: {
    type: InstagramContentType.INSTAGRAM_REEL_DANCE,
    priority: 1,
    downloadStrategy: 'none',
    transcriptionStrategy: 'skip',
    summaryComplexity: 'basic',
    shouldTranscribe: false,
  },
};

/**
 * Instagram content classifier that determines processing strategy based on reel characteristics
 */
@Injectable()
export class InstagramContentClassifier {
  private readonly logger = new Logger(InstagramContentClassifier.name);

  /**
   * Classify Instagram Reel content and determine processing strategy
   */
  classify(metadata: InstagramMetadata): InstagramContentType {
    const { caption = '', hashtags = [], audio_name = '', duration = 0 } = metadata;
    
    this.logger.debug(`Classifying Instagram Reel: author: ${metadata.author_name}, duration: ${duration}s`);

    // Music/Dance detection (highest priority for cost savings)
    if (this.isMusicContent(audio_name, hashtags, caption)) {
      return InstagramContentType.INSTAGRAM_REEL_MUSIC;
    }

    // Dance content detection
    if (this.isDanceContent(hashtags, caption, audio_name)) {
      return InstagramContentType.INSTAGRAM_REEL_DANCE;
    }

    // Educational/Tutorial detection
    if (this.isEducationalContent(caption, hashtags)) {
      return InstagramContentType.INSTAGRAM_REEL_TUTORIAL;
    }

    // Meme/Reaction content
    if (this.isMemeContent(hashtags, caption)) {
      return InstagramContentType.INSTAGRAM_REEL_MEME;
    }

    // Default to standard reel
    return InstagramContentType.INSTAGRAM_REEL_STANDARD;
  }

  /**
   * Get processing strategy for a content type
   */
  getProcessingStrategy(contentType: InstagramContentType): InstagramProcessingStrategy {
    return INSTAGRAM_PROCESSING_STRATEGIES[contentType];
  }

  /**
   * Detect if content is primarily music
   */
  private isMusicContent(audioName: string, hashtags: string[], caption: string): boolean {
    const musicKeywords = [
      'music',
      'song',
      'cover',
      'singing',
      'remix',
      'acoustic',
      'performance',
      'artist',
      'album',
      'track',
      'beat',
      'instrumental',
      'karaoke',
      'playlist',
    ];

    const musicHashtags = ['#music', '#song', '#cover', '#singing', '#musician', '#singer', '#artist'];

    // Check audio name for artist/song patterns
    const audioLower = audioName.toLowerCase();
    if (audioLower.includes(' - ') || audioLower.includes('remix') || audioLower.includes('cover')) {
      return true;
    }

    // Check hashtags
    if (hashtags.some(tag => musicHashtags.includes(tag.toLowerCase()))) {
      return true;
    }

    // Check caption
    const captionLower = caption.toLowerCase();
    return musicKeywords.some(keyword => captionLower.includes(keyword));
  }

  /**
   * Detect if content is dance-focused
   */
  private isDanceContent(hashtags: string[], caption: string, audioName: string): boolean {
    const danceHashtags = [
      '#dance',
      '#dancing',
      '#choreography',
      '#dancer',
      '#dancechallenge',
      '#dancevideo',
      '#dancelife',
      '#dancemoves',
    ];

    const danceKeywords = [
      'dance',
      'dancing',
      'choreography',
      'moves',
      'routine',
      'challenge',
    ];

    // Check for trending dance audio (often includes "dance" or specific dance names)
    const audioLower = audioName.toLowerCase();
    if (danceKeywords.some(keyword => audioLower.includes(keyword))) {
      return true;
    }

    // Check hashtags (most reliable for dance content)
    if (hashtags.some(tag => danceHashtags.includes(tag.toLowerCase()))) {
      return true;
    }

    // Check caption
    const captionLower = caption.toLowerCase();
    return danceKeywords.some(keyword => captionLower.includes(keyword)) &&
           !captionLower.includes('tutorial') && // Exclude dance tutorials
           !captionLower.includes('how to');
  }

  /**
   * Detect if content is educational
   */
  private isEducationalContent(caption: string, hashtags: string[]): boolean {
    const eduKeywords = [
      'tutorial',
      'how to',
      'howto',
      'learn',
      'tips',
      'guide',
      'explained',
      'step by step',
      'diy',
      'hack',
      'advice',
      'lesson',
      'teaching',
      'education',
      'fact',
      'did you know',
    ];

    const eduHashtags = [
      '#tutorial',
      '#howto',
      '#learn',
      '#education',
      '#tips',
      '#diy',
      '#lifehacks',
      '#advice',
      '#teaching',
      '#facts',
      '#didyouknow',
    ];

    const captionLower = caption.toLowerCase();

    // Check hashtags
    if (hashtags.some(tag => eduHashtags.includes(tag.toLowerCase()))) {
      return true;
    }

    // Check caption for educational patterns
    return eduKeywords.some(keyword => captionLower.includes(keyword));
  }

  /**
   * Detect if content is meme/reaction
   */
  private isMemeContent(hashtags: string[], caption: string): boolean {
    const memeHashtags = [
      '#meme',
      '#memes',
      '#funny',
      '#comedy',
      '#reaction',
      '#viral',
      '#relatable',
      '#mood',
      '#lol',
      '#humor',
    ];

    const memeKeywords = [
      'meme',
      'reaction',
      'pov',
      'when you',
      'that moment',
      'be like',
      'mood',
      'vibe',
    ];

    const captionLower = caption.toLowerCase();

    // Check hashtags
    if (hashtags.some(tag => memeHashtags.includes(tag.toLowerCase()))) {
      return true;
    }

    // Check caption for meme patterns
    return memeKeywords.some(keyword => captionLower.includes(keyword));
  }

  /**
   * Extract hashtags from caption
   */
  extractHashtags(caption: string): string[] {
    const hashtagRegex = /#[a-zA-Z0-9_]+/g;
    const matches = caption.match(hashtagRegex) || [];
    return matches.map(tag => tag.toLowerCase());
  }
}