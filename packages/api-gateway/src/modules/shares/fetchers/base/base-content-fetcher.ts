import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../../config/services/config.service';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from '../../constants/platform.enum';
import {
  ContentFetcherInterface,
  FetchRequest,
  FetchResponse,
  FetcherConfig,
} from '../interfaces/content-fetcher.interface';
import {
  FetcherError,
  FetcherErrorCode,
  RetryableFetcherError,
} from '../interfaces/fetcher-error.interface';

/**
 * Base abstract class for all content fetchers
 * Provides common functionality for HTTP requests, error handling, and timeout management
 */
@Injectable()
export abstract class BaseContentFetcher implements ContentFetcherInterface {
  protected readonly logger: Logger;
  protected readonly httpClient: AxiosInstance;
  protected readonly config: FetcherConfig;
  protected readonly defaultTimeout: number = 10000; // 10 seconds

  constructor(
    protected readonly platform: Platform,
    protected readonly configService: ConfigService
  ) {
    this.logger = new Logger(`${platform}Fetcher`);
    this.config = this.loadConfig();
    this.httpClient = this.createHttpClient();
  }

  /**
   * Abstract methods that must be implemented by each platform fetcher
   */
  abstract fetchContent(request: FetchRequest): Promise<FetchResponse>;
  abstract canHandle(url: string): boolean;

  /**
   * Get the platform this fetcher handles
   */
  getPlatform(): Platform {
    return this.platform;
  }

  /**
   * Load configuration for this fetcher
   */
  protected loadConfig(): FetcherConfig {
    return {
      userAgent: this.configService.get<string>(
        'FETCHER_USER_AGENT',
        'BookmarkAI/1.0 (Content Fetcher)'
      ),
      defaultTimeout: this.configService.get<number>(
        `FETCHER_${this.platform.toUpperCase()}_TIMEOUT`,
        this.defaultTimeout
      ),
      credentials: this.loadCredentials(),
      enabledPlatforms: this.configService
        .get<string>('ENABLED_PLATFORMS', 'tiktok,reddit,generic')
        .split(',')
        .map((p) => p.trim() as Platform),
    };
  }

  /**
   * Load platform-specific credentials
   */
  protected loadCredentials(): FetcherConfig['credentials'] {
    const prefix = `FETCHER_${this.platform.toUpperCase()}`;
    
    return {
      apiKey: this.configService.get<string>(`${prefix}_API_KEY`, null),
      oauth: this.loadOAuthConfig(prefix),
      cookies: this.loadCookies(prefix),
    };
  }

  /**
   * Load OAuth configuration if available
   */
  protected loadOAuthConfig(prefix: string) {
    const clientId = this.configService.get<string>(`${prefix}_CLIENT_ID`, null);
    const clientSecret = this.configService.get<string>(`${prefix}_CLIENT_SECRET`, null);
    
    if (!clientId || !clientSecret) return undefined;
    
    return {
      clientId,
      clientSecret,
      accessToken: this.configService.get<string>(`${prefix}_ACCESS_TOKEN`, null),
      refreshToken: this.configService.get<string>(`${prefix}_REFRESH_TOKEN`, null),
    };
  }

  /**
   * Load cookies configuration
   */
  protected loadCookies(prefix: string): Record<string, string> | undefined {
    const cookiesJson = this.configService.get<string>(`${prefix}_COOKIES`, null);
    if (!cookiesJson) return undefined;
    
    try {
      return JSON.parse(cookiesJson);
    } catch (error) {
      this.logger.warn(`Failed to parse cookies configuration: ${error.message}`);
      return undefined;
    }
  }

  /**
   * Create HTTP client with default configuration
   */
  protected createHttpClient(): AxiosInstance {
    return axios.create({
      timeout: this.config.defaultTimeout,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      validateStatus: (status) => status < 500, // Don't throw on 4xx errors
    });
  }

  /**
   * Perform HTTP request with timeout and error handling
   */
  protected async fetchWithTimeout(
    url: string,
    headers: Record<string, string> = {},
    timeout?: number
  ): Promise<any> {
    try {
      const response = await this.httpClient.get(url, {
        headers,
        timeout: timeout || this.config.defaultTimeout,
      });

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = this.extractRetryAfter(response.headers);
        throw new RetryableFetcherError(
          'Rate limit exceeded',
          FetcherErrorCode.RATE_LIMIT_EXCEEDED,
          this.platform,
          retryAfter
        );
      }

      // Handle not found
      if (response.status === 404) {
        throw new FetcherError(
          'Content not found',
          FetcherErrorCode.CONTENT_NOT_FOUND,
          this.platform
        );
      }

      // Handle private/forbidden content
      if (response.status === 403 || response.status === 401) {
        throw new FetcherError(
          'Content is private or requires authentication',
          FetcherErrorCode.CONTENT_PRIVATE,
          this.platform
        );
      }

      return response;
    } catch (error) {
      // Handle network errors
      if (error instanceof AxiosError) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
          throw new RetryableFetcherError(
            'Request timeout',
            FetcherErrorCode.TIMEOUT,
            this.platform,
            30
          );
        }
        
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          throw new RetryableFetcherError(
            'Network error',
            FetcherErrorCode.NETWORK_ERROR,
            this.platform,
            60
          );
        }
      }

      // Re-throw if already a FetcherError
      if (error instanceof FetcherError) {
        throw error;
      }

      // Wrap unknown errors
      throw new FetcherError(
        `Unexpected error: ${error.message}`,
        FetcherErrorCode.API_UNAVAILABLE,
        this.platform,
        error
      );
    }
  }

  /**
   * Extract retry-after header value
   */
  protected extractRetryAfter(headers: Record<string, any>): number {
    const retryAfter = headers['retry-after'];
    if (!retryAfter) return 60; // Default to 60 seconds

    // If it's a number, it's seconds
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds;

    // If it's a date, calculate seconds until then
    const retryDate = new Date(retryAfter);
    if (!isNaN(retryDate.getTime())) {
      const now = new Date();
      return Math.max(1, Math.floor((retryDate.getTime() - now.getTime()) / 1000));
    }

    return 60; // Default fallback
  }

  /**
   * Validate URL format
   */
  protected validateUrl(url: string): void {
    try {
      new URL(url);
    } catch (error) {
      throw new FetcherError(
        'Invalid URL format',
        FetcherErrorCode.INVALID_URL,
        this.platform
      );
    }
  }

  /**
   * Log metrics for monitoring
   */
  protected logMetrics(
    event: 'fetch_start' | 'fetch_success' | 'fetch_error',
    details?: Record<string, any>
  ): void {
    this.logger.log({
      event,
      platform: this.platform,
      timestamp: new Date().toISOString(),
      ...details,
    });
  }
}