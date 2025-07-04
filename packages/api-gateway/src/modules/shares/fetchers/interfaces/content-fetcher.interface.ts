import { Platform } from '../../constants/platform.enum';

/**
 * Primary interface all fetchers must implement
 */
export interface ContentFetcherInterface {
  fetchContent(request: FetchRequest): Promise<FetchResponse>;
  canHandle(url: string): boolean;
  getPlatform(): Platform;
}

/**
 * Request structure for content fetching
 */
export interface FetchRequest {
  url: string;
  shareId: string;
  userId: string;
  options?: FetchOptions;
}

/**
 * Options for fetch requests
 */
export interface FetchOptions {
  timeout?: number;
  userAgent?: string;
  cookies?: Record<string, string>;
}

/**
 * Standardized response format for all platforms
 */
export interface FetchResponse {
  content: {
    text?: string;         // Caption, title, or main text
    description?: string;  // Secondary text if available
  };
  
  media?: {
    type: 'video' | 'image' | 'audio' | 'none';
    url?: string;          // For Task 2.7 to download (local file path or URL)
    originalUrl?: string;  // Original extracted URL for reference
    thumbnailUrl?: string;
    duration?: number;
    fileSize?: number;     // File size in bytes
    isLocalFile?: boolean; // Flag to indicate local file vs URL
  };
  
  metadata: {
    author?: string;
    publishedAt?: Date;
    platform: Platform;
    platformId?: string;
  };
  
  platformData?: Record<string, unknown>;  // Raw data for JSONB storage
  
  hints?: {
    hasNativeCaptions?: boolean;  // For Phase 3 ML pipeline
    language?: string;
    requiresAuth?: boolean;
    isRedditTextOnly?: boolean;   // Reddit text-only posts (no media)
  };
  
  // HTTP response headers for rate limiting and operational needs
  responseHeaders?: Record<string, any>;
}

/**
 * Configuration for content fetchers
 */
export interface FetcherConfig {
  userAgent?: string;
  defaultTimeout?: number;
  credentials?: {
    apiKey?: string;
    oauth?: OAuthConfig;
    cookies?: Record<string, string>;
  };
  enabledPlatforms?: Platform[];
}

/**
 * OAuth configuration structure
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}