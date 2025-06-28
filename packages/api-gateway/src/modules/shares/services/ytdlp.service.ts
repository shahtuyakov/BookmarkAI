import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { ConfigService } from '../../../config/services/config.service';
import { Redis } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { S3StorageService } from './s3-storage.service';

export interface YtDlpResult {
  url: string;           // Original URL for reference
  localPath?: string;    // Path to downloaded file (deprecated, use storageUrl)
  storageUrl?: string;   // S3 URL or local path
  storageType?: 'local' | 's3';  // Storage location type
  duration?: number;
  title?: string;
  description?: string;
  thumbnail?: string;
  uploader?: string;
  uploadDate?: string;
  viewCount?: number;
  fileSize?: number;     // Size of downloaded file in bytes
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
  private readonly timeout = 60000; // 60 seconds (increased for downloads)
  private redisClient: Redis;
  private readonly downloadDir: string;
  private readonly storageMode: 'local' | 's3' | 'hybrid';
  private readonly s3SplitPercentage: number;
  
  // Metrics
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    timeouts: 0,
    s3Uploads: 0,
    s3UploadErrors: 0,
    localStorage: 0,
  };
  
  constructor(
    private readonly configService: ConfigService,
    private readonly s3Storage: S3StorageService,
  ) {
    // Set up download directory
    this.downloadDir = this.configService.get('YTDLP_DOWNLOAD_DIR', '/tmp/bookmarkai-videos');
    this.ensureDownloadDir();
    
    // Configure storage mode
    this.storageMode = this.configService.get('STORAGE_MODE', 'local') as 'local' | 's3' | 'hybrid';
    this.s3SplitPercentage = parseInt(this.configService.get('S3_SPLIT_PERCENTAGE', '10'), 10);
    
    this.logger.log(`Storage mode: ${this.storageMode}${this.storageMode === 'hybrid' ? ` (${this.s3SplitPercentage}% S3)` : ''}`);
    
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
   * Download video and extract information using yt-dlp
   */
  async extractVideoInfo(url: string, downloadVideo: boolean = true): Promise<YtDlpResult | null> {
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
      this.logger.log(`${downloadVideo ? 'Downloading video and extracting info' : 'Extracting video info'} for: ${sanitizedUrl}`);
      const startTime = Date.now();
      const result = await this.runYtDlp(sanitizedUrl, downloadVideo);
      const extractionTime = Date.now() - startTime;
      
      if (result) {
        this.metrics.successfulExtractions++;
        this.logger.log(`${downloadVideo ? 'Download and extraction' : 'Extraction'} completed in ${extractionTime}ms`);
        if (result.localPath) {
          this.logger.log(`Video downloaded to: ${result.localPath}`);
        }
        
        // Cache the result (but don't cache local paths across restarts)
        const cacheResult = { ...result };
        if (downloadVideo) {
          delete cacheResult.localPath;
        }
        await this.saveToCache(sanitizedUrl, cacheResult);
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
  private async runYtDlp(url: string, downloadVideo: boolean = true): Promise<YtDlpResult | null> {
    return new Promise((resolve, reject) => {
      const videoId = this.generateVideoId(url);
      const outputTemplate = path.join(this.downloadDir, `${videoId}.%(ext)s`);
      
      const args = downloadVideo ? [
        '--format', 'best[height<=720]/best',  // Limit quality to 720p for efficiency
        '--output', outputTemplate,             // Save to specific location
        '--write-info-json',                   // Also write metadata JSON
        '--no-playlist',                       // Don't download playlists
        '--no-warnings',                       // Suppress warnings
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        '--no-check-certificate',              // Skip SSL verification
        url
      ] : [
        '--dump-json',                         // Output JSON without downloading
        '--no-playlist',                       // Don't download playlists
        '--no-warnings',                       // Suppress warnings
        '--quiet',                             // Suppress progress
        '--no-check-certificate',              // Skip SSL verification
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        url
      ];

      // Debug: Log the exact command being executed
      this.logger.log(`Executing yt-dlp with args: ${JSON.stringify(args)}`);
      this.logger.log(`Output template: ${outputTemplate}`);
      this.logger.log(`Video ID: ${videoId}`);
      
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

        // Enhanced debugging
        this.logger.log(`yt-dlp process exited with code: ${code}`);
        this.logger.log(`yt-dlp stderr: ${stderr}`);
        this.logger.log(`yt-dlp stdout: ${stdout.substring(0, 200)}...`);

        if (code !== 0) {
          this.logger.error(`yt-dlp exited with code ${code}: ${stderr}`);
          resolve(null);
          return;
        }

        try {
          if (downloadVideo) {
            // When downloading, parse the info JSON file
            const infoJsonPath = path.join(this.downloadDir, `${videoId}.info.json`);
            
            // Debug: List all files in download directory
            try {
              const files = fs.readdirSync(this.downloadDir);
              this.logger.log(`Files in download dir: ${files.join(', ')}`);
              this.logger.log(`Looking for info file: ${infoJsonPath}`);
            } catch (err) {
              this.logger.error(`Error reading download directory: ${err.message}`);
            }
            
            if (fs.existsSync(infoJsonPath)) {
              const infoData = JSON.parse(fs.readFileSync(infoJsonPath, 'utf8'));
              
              // Clean up info JSON file
              fs.unlinkSync(infoJsonPath);
              
              // Parse and handle storage
              this.parseYtDlpOutput(infoData, videoId).then(result => {
                // Debug: Verify storage result
                if (result.storageUrl) {
                  this.logger.log(`Video stored at: ${result.storageUrl} (${result.storageType})`);
                } else {
                  this.logger.error(`Failed to store video`);
                }
                
                resolve(result);
              });
            } else {
              this.logger.error(`Info JSON file not found after download: ${infoJsonPath}`);
              resolve(null);
            }
          } else {
            // When not downloading, parse stdout JSON
            const data = JSON.parse(stdout);
            this.parseYtDlpOutput(data).then(result => resolve(result));
          }
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
  private async parseYtDlpOutput(data: any, videoId?: string): Promise<YtDlpResult> {
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

    const result: YtDlpResult = {
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
    
    // If we downloaded the video, handle storage
    if (videoId) {
      const localPath = this.findDownloadedFile(videoId);
      if (localPath) {
        try {
          const stats = fs.statSync(localPath);
          result.fileSize = stats.size;
          
          // Determine storage destination
          const useS3 = this.shouldUseS3();
          
          if (useS3 && this.s3Storage.isConfigured()) {
            // Upload to S3
            const s3Result = await this.uploadToS3(localPath, data);
            if (s3Result) {
              result.storageUrl = s3Result.s3Url;
              result.storageType = 's3';
              this.metrics.s3Uploads++;
              
              // Delete local file after successful S3 upload
              try {
                fs.unlinkSync(localPath);
                this.logger.log(`Deleted local file after S3 upload: ${localPath}`);
              } catch (error) {
                this.logger.warn(`Failed to delete local file: ${error.message}`);
              }
            } else {
              // Fallback to local storage if S3 upload fails
              result.localPath = localPath;
              result.storageUrl = localPath;
              result.storageType = 'local';
              this.metrics.s3UploadErrors++;
              this.metrics.localStorage++;
            }
          } else {
            // Use local storage
            result.localPath = localPath;
            result.storageUrl = localPath;
            result.storageType = 'local';
            this.metrics.localStorage++;
          }
        } catch (error) {
          this.logger.warn(`Error processing downloaded file: ${error.message}`);
          result.localPath = localPath;
          result.storageUrl = localPath;
          result.storageType = 'local';
        }
      }
    }
    
    return result;
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
      
    const s3UploadRate = this.metrics.successfulExtractions > 0
      ? (this.metrics.s3Uploads / this.metrics.successfulExtractions) * 100
      : 0;

    return {
      ...this.metrics,
      cacheHitRate: `${cacheHitRate.toFixed(2)}%`,
      successRate: `${successRate.toFixed(2)}%`,
      s3UploadRate: `${s3UploadRate.toFixed(2)}%`,
      storageMode: this.storageMode,
      s3Configured: this.s3Storage.isConfigured(),
    };
  }

  /**
   * Ensure download directory exists
   */
  private ensureDownloadDir(): void {
    try {
      if (!fs.existsSync(this.downloadDir)) {
        fs.mkdirSync(this.downloadDir, { recursive: true });
        this.logger.log(`Created download directory: ${this.downloadDir}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create download directory: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Generate a unique video ID for file naming
   */
  private generateVideoId(url: string): string {
    const hash = crypto.createHash('sha256').update(url).digest('hex');
    return hash.substring(0, 16) + '_' + Date.now();
  }
  
  /**
   * Find the downloaded file with the given video ID
   */
  private findDownloadedFile(videoId: string): string | null {
    try {
      const files = fs.readdirSync(this.downloadDir);
      const videoFile = files.find(file => 
        file.startsWith(videoId) && 
        !file.endsWith('.info.json') &&
        (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv'))
      );
      
      if (videoFile) {
        return path.join(this.downloadDir, videoFile);
      }
    } catch (error) {
      this.logger.error(`Error finding downloaded file: ${error.message}`);
    }
    
    return null;
  }
  
  /**
   * Clean up old downloaded files (older than 24 hours)
   */
  async cleanupOldFiles(): Promise<void> {
    try {
      const files = fs.readdirSync(this.downloadDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      let deletedCount = 0;
      for (const file of files) {
        const filePath = path.join(this.downloadDir, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
      
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old video files`);
      }
    } catch (error) {
      this.logger.error(`Error during cleanup: ${error.message}`);
    }
  }
  
  /**
   * Determine whether to use S3 based on storage mode
   */
  private shouldUseS3(): boolean {
    if (this.storageMode === 's3') {
      return true;
    }
    
    if (this.storageMode === 'hybrid') {
      // Use random percentage for hybrid mode
      const random = Math.random() * 100;
      return random < this.s3SplitPercentage;
    }
    
    return false;
  }

  /**
   * Upload video to S3
   */
  private async uploadToS3(localPath: string, metadata: any) {
    try {
      const uploadMetadata = {
        'video-title': metadata.title || 'Unknown',
        'video-duration': String(metadata.duration || 0),
        'video-uploader': metadata.uploader || 'Unknown',
        'source-url': metadata.webpage_url || metadata.url,
      };
      
      const result = await this.s3Storage.uploadFile(localPath, {
        metadata: uploadMetadata,
      });
      
      if (result) {
        this.logger.log(`Successfully uploaded to S3: ${result.s3Url}`);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`Failed to upload to S3: ${error.message}`);
      return null;
    }
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