/**
 * Instagram URL Parser and Content Type Detector
 */

export enum InstagramUrlType {
  REEL = 'reel',
  POST = 'post',
  TV = 'tv',
  STORIES = 'stories',
  PROFILE = 'profile',
  DIRECT = 'direct',
  UNKNOWN = 'unknown',
}

export interface InstagramUrlInfo {
  type: InstagramUrlType;
  contentId: string | null;
  isSupported: boolean;
}

// Instagram URL patterns for different content types
const INSTAGRAM_URL_PATTERNS = {
  // Reels - what we want to support
  REEL: /(?:instagram\.com|instagr\.am)\/(?:reels?|reel)\/([A-Za-z0-9_-]+)/,
  
  // Posts - regular photo/video posts
  POST: /(?:instagram\.com|instagr\.am)\/p\/([A-Za-z0-9_-]+)/,
  
  // TV/IGTV - longer videos
  TV: /(?:instagram\.com|instagr\.am)\/tv\/([A-Za-z0-9_-]+)/,
  
  // Stories - ephemeral content
  STORIES: /(?:instagram\.com|instagr\.am)\/stories\/([^\/]+)\/([0-9]+)/,
  
  // Profile pages
  PROFILE: /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9_.]+)\/?$/,
  
  // Direct/messages
  DIRECT: /(?:instagram\.com|instagr\.am)\/direct\//,
};

// Mobile app share URLs might look different
const INSTAGRAM_MOBILE_PATTERNS = {
  REEL: /instagram:\/\/reel\?id=([A-Za-z0-9_-]+)/,
  POST: /instagram:\/\/media\?id=([0-9]+)/,
};

// Error messages for unsupported content
export const UNSUPPORTED_CONTENT_MESSAGES = {
  post: 'Regular Instagram posts are not supported. Please share Instagram Reels instead.',
  tv: 'IGTV videos are not supported. Please share Instagram Reels instead.',
  stories: 'Instagram Stories cannot be saved as they are temporary content.',
  profile: 'Profile pages cannot be saved. Please share specific Reels instead.',
  direct: 'Direct messages cannot be saved. Please share public Reels instead.',
  unknown: 'This Instagram URL format is not recognized. Please share a Reel URL.',
};

export class InstagramUrlParser {
  static detectContentType(url: string): InstagramUrlInfo {
    // Normalize URL
    const normalizedUrl = url.toLowerCase().trim();
    
    // Check each pattern
    for (const [type, pattern] of Object.entries(INSTAGRAM_URL_PATTERNS)) {
      const match = normalizedUrl.match(pattern);
      if (match) {
        return {
          type: type.toLowerCase() as InstagramUrlType,
          contentId: match[1] || null,
          isSupported: type === 'REEL', // Only Reels are supported for MVP
        };
      }
    }
    
    // Check mobile patterns
    for (const [type, pattern] of Object.entries(INSTAGRAM_MOBILE_PATTERNS)) {
      const match = normalizedUrl.match(pattern);
      if (match) {
        return {
          type: type.toLowerCase() as InstagramUrlType,
          contentId: match[1],
          isSupported: type === 'REEL',
        };
      }
    }
    
    return {
      type: InstagramUrlType.UNKNOWN,
      contentId: null,
      isSupported: false,
    };
  }

  /**
   * Extract reel ID from URL
   */
  static extractReelId(url: string): string | null {
    const info = this.detectContentType(url);
    return info.type === InstagramUrlType.REEL ? info.contentId : null;
  }

  /**
   * Check if URL is a supported Instagram Reel
   */
  static isInstagramReel(url: string): boolean {
    const info = this.detectContentType(url);
    return info.isSupported;
  }
}