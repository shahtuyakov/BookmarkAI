import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '../../../config/services/config.service';
import { Redis } from 'ioredis';

export interface YtDlpResult {
  url: string;
  duration?: number;
  title?: string;
  description?: string;
  thumbnail?: string;
  uploader?: string;
  uploadDate?: string;
  viewCount?: number;
  formats?: Array<{
    format_id: string;
    ext: string;
    quality?: number;
    filesize?: number;
    vcodec?: string;
    acodec?: string;
    url: string;
  }>;
}

@Injectable()
export class YtDlpService {
  private readonly logger = new Logger(YtDlpService.name);
  private readonly cachePrefix = 'ytdlp:';
  private readonly cacheTTL = 3600; // 1 hour
  private readonly timeout = 30000; // 30 seconds
  private redisClient: Redis;
  
  // Metrics
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    timeouts: 0,
  };
  
  constructor(
    private readonly configService: ConfigService,
  ) {
    // Create Redis client for caching
    this.redisClient = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      keyPrefix: 'bookmarkai:',
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  /**
   * Extract video information using yt-dlp
   */
  async extractVideoInfo(url: string): Promise<YtDlpResult | null> {
    this.metrics.totalRequests++;
    
    // Sanitize URL
    const sanitizedUrl = this.sanitizeUrl(url);
    if (!sanitizedUrl) {
      this.logger.error(`Invalid URL provided: ${url}`);
      this.metrics.failedExtractions++;
      return null;
    }

    // Check cache first
    const cached = await this.getFromCache(sanitizedUrl);
    if (cached) {
      this.logger.log(`Cache hit for URL: ${sanitizedUrl}`);
      this.metrics.cacheHits++;
      return cached;
    }
    
    this.metrics.cacheMisses++;

    try {
      this.logger.log(`Extracting video info for: ${sanitizedUrl}`);
      const startTime = Date.now();
      const result = await this.runYtDlp(sanitizedUrl);
      const extractionTime = Date.now() - startTime;
      
      if (result) {
        this.metrics.successfulExtractions++;
        this.logger.log(`Extraction completed in ${extractionTime}ms`);
        
        // Cache the result
        await this.saveToCache(sanitizedUrl, result);
      } else {
        this.metrics.failedExtractions++;
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to extract video info: ${error.message}`);
      this.metrics.failedExtractions++;
      
      if (error.message.includes('timeout')) {
        this.metrics.timeouts++;
      }
      
      return null;
    }
  }

  /**
   * Run yt-dlp subprocess
   */
  private async runYtDlp(url: string): Promise<YtDlpResult | null> {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',           // Output JSON without downloading
        '--no-playlist',         // Don't download playlists
        '--no-warnings',         // Suppress warnings
        '--quiet',               // Suppress progress
        '--no-check-certificate', // Skip SSL verification (for some sites)
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        url
      ];

      const ytdlp = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';
      let killed = false;

      // Set timeout
      const timeoutId = setTimeout(() => {
        killed = true;
        ytdlp.kill('SIGTERM');
        reject(new Error('yt-dlp process timed out'));
      }, this.timeout);

      ytdlp.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ytdlp.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ytdlp.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!killed) {
          this.logger.error(`yt-dlp spawn error: ${error.message}`);
          reject(error);
        }
      });

      ytdlp.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (killed) {
          return; // Already rejected due to timeout
        }

        if (code !== 0) {
          this.logger.error(`yt-dlp exited with code ${code}: ${stderr}`);
          resolve(null);
          return;
        }

        try {
          const data = JSON.parse(stdout);
          const result = this.parseYtDlpOutput(data);
          resolve(result);
        } catch (error) {
          this.logger.error(`Failed to parse yt-dlp output: ${error.message}`);
          resolve(null);
        }
      });
    });
  }

  /**
   * Parse yt-dlp JSON output
   */
  private parseYtDlpOutput(data: any): YtDlpResult {
    // Find the best video format
    let videoUrl = data.url || data.webpage_url;
    
    if (data.formats && Array.isArray(data.formats)) {
      // Find format with both video and audio
      const bestFormat = data.formats
        .filter((f: any) => f.vcodec !== 'none' && f.acodec !== 'none' && f.url)
        .sort((a: any, b: any) => {
          // Prefer formats with known quality
          const aQuality = a.quality || a.height || 0;
          const bQuality = b.quality || b.height || 0;
          return bQuality - aQuality;
        })[0];
      
      if (bestFormat) {
        videoUrl = bestFormat.url;
      }
    }

    return {
      url: videoUrl,
      duration: data.duration,
      title: data.title,
      description: data.description,
      thumbnail: data.thumbnail,
      uploader: data.uploader || data.channel,
      uploadDate: data.upload_date,
      viewCount: data.view_count,
      formats: data.formats?.map((f: any) => ({
        format_id: f.format_id,
        ext: f.ext,
        quality: f.quality || f.height,
        filesize: f.filesize,
        vcodec: f.vcodec,
        acodec: f.acodec,
        url: f.url,
      })),
    };
  }

  /**
   * Sanitize and validate URL
   */
  private sanitizeUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP and HTTPS
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return null;
      }

      // Remove any potential command injection attempts
      const cleanUrl = url.replace(/[;&|`$()]/g, '');
      
      // Verify it's still a valid URL after cleaning
      new URL(cleanUrl);
      
      return cleanUrl;
    } catch {
      return null;
    }
  }

  /**
   * Get cached result
   */
  private async getFromCache(url: string): Promise<YtDlpResult | null> {
    try {
      const key = `${this.cachePrefix}${this.hashUrl(url)}`;
      const cached = await this.redisClient.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn(`Cache retrieval error: ${error.message}`);
    }
    
    return null;
  }

  /**
   * Save to cache
   */
  private async saveToCache(url: string, result: YtDlpResult): Promise<void> {
    try {
      const key = `${this.cachePrefix}${this.hashUrl(url)}`;
      await this.redisClient.setex(
        key,
        this.cacheTTL,
        JSON.stringify(result)
      );
    } catch (error) {
      this.logger.warn(`Cache save error: ${error.message}`);
    }
  }

  /**
   * Create a hash of the URL for cache key
   */
  private hashUrl(url: string): string {
    // Simple hash using base64 encoding
    return Buffer.from(url).toString('base64').replace(/[/+=]/g, '');
  }

  /**
   * Check if yt-dlp is available
   */
  async checkAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      const ytdlp = spawn('yt-dlp', ['--version']);
      
      ytdlp.on('error', () => {
        this.logger.error('yt-dlp is not available');
        resolve(false);
      });

      ytdlp.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  /**
   * Get service metrics
   */
  getMetrics() {
    const cacheHitRate = this.metrics.totalRequests > 0 
      ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100 
      : 0;
      
    const successRate = (this.metrics.successfulExtractions + this.metrics.cacheHits) > 0
      ? ((this.metrics.successfulExtractions + this.metrics.cacheHits) / this.metrics.totalRequests) * 100
      : 0;

    return {
      ...this.metrics,
      cacheHitRate: `${cacheHitRate.toFixed(2)}%`,
      successRate: `${successRate.toFixed(2)}%`,
    };
  }

  /**
   * Clean up resources
   */
  async onModuleDestroy() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}