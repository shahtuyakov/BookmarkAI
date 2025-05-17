/**
 * Supported social media platforms
 */
export enum Platform {
    TIKTOK = 'tiktok',
    REDDIT = 'reddit',
    TWITTER = 'twitter',
    X = 'x',
    UNKNOWN = 'unknown',
  }
  
  /**
   * Detect platform from URL
   * @param url URL to check
   * @returns Platform enum value
   */
  export function detectPlatform(url: string): Platform {
    try {
      const urlObj = new URL(url);
      const host = urlObj.hostname.toLowerCase();
      
      if (host.includes('tiktok.com')) return Platform.TIKTOK;
      if (host.includes('reddit.com')) return Platform.REDDIT;
      if (host.includes('twitter.com')) return Platform.TWITTER;
      if (host.includes('x.com')) return Platform.X;
      
      return Platform.UNKNOWN;
    } catch (error) {
      return Platform.UNKNOWN;
    }
  }