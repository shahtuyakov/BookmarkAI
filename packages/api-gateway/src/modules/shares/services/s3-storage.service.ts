import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '../../../config/services/config.service';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export interface S3UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  expiresIn?: number; // For pre-signed URLs
}

export interface S3UploadResult {
  s3Url: string;        // s3://bucket/key
  httpsUrl: string;     // https://bucket.s3.region.amazonaws.com/key
  key: string;          // Object key
  bucket: string;       // Bucket name
  size?: number;        // File size in bytes
  etag?: string;        // ETag from S3
}

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly videoPrefix: string;
  
  constructor(
    private readonly configService: ConfigService,
  ) {
    this.region = this.configService.get('AWS_REGION', 'us-east-1');
    this.bucket = this.configService.get('S3_MEDIA_BUCKET', '');
    this.videoPrefix = this.configService.get('S3_VIDEO_PREFIX', 'temp/videos/');
    
    if (!this.bucket) {
      this.logger.warn('S3_MEDIA_BUCKET not configured - S3 storage will not be available');
    }
    
    // Configure S3 client with support for MinIO/custom endpoints
    const endpoint = this.configService.get('S3_ENDPOINT', '');
    const accessKeyId = this.configService.get('S3_ACCESS_KEY', '');
    const secretAccessKey = this.configService.get('S3_SECRET_KEY', '');
    const forcePathStyle = this.configService.get<string>('S3_USE_PATH_STYLE', 'false') === 'true';
    
    const s3Config: any = {
      region: this.region,
    };
    
    // Add custom endpoint if provided (for MinIO)
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = forcePathStyle; // Required for MinIO
      this.logger.log(`Using custom S3 endpoint: ${endpoint}`);
    }
    
    // Add explicit credentials if provided
    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }
    
    this.s3Client = new S3Client(s3Config);
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    filePath: string,
    options: S3UploadOptions = {}
  ): Promise<S3UploadResult | null> {
    if (!this.bucket) {
      this.logger.error('S3 bucket not configured');
      return null;
    }
    
    try {
      const fileName = path.basename(filePath);
      const key = this.generateS3Key(fileName);
      const fileStream = fs.createReadStream(filePath);
      const fileStats = fs.statSync(filePath);
      
      // Determine content type
      const contentType = options.contentType || this.getContentType(fileName);
      
      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
        Metadata: {
          ...options.metadata,
          'original-filename': fileName,
          'upload-timestamp': new Date().toISOString(),
        },
      });
      
      const startTime = Date.now();
      const response = await this.s3Client.send(command);
      const uploadTime = Date.now() - startTime;
      
      this.logger.log(`Uploaded ${fileName} to S3 in ${uploadTime}ms`);
      
      const httpsUrl = this.generateHttpsUrl(key);
      
      return {
        s3Url: `s3://${this.bucket}/${key}`,
        httpsUrl,
        key,
        bucket: this.bucket,
        size: fileStats.size,
        etag: response.ETag,
      };
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`);
      return null;
    }
  }

  /**
   * Upload a buffer to S3
   */
  async uploadBuffer(
    buffer: Buffer,
    fileName: string,
    options: S3UploadOptions = {}
  ): Promise<S3UploadResult | null> {
    if (!this.bucket) {
      this.logger.error('S3 bucket not configured');
      return null;
    }
    
    try {
      const key = this.generateS3Key(fileName);
      const contentType = options.contentType || this.getContentType(fileName);
      
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          ...options.metadata,
          'original-filename': fileName,
          'upload-timestamp': new Date().toISOString(),
        },
      });
      
      const response = await this.s3Client.send(command);
      
      const httpsUrl = this.generateHttpsUrl(key);
      
      return {
        s3Url: `s3://${this.bucket}/${key}`,
        httpsUrl,
        key,
        bucket: this.bucket,
        size: buffer.length,
        etag: response.ETag,
      };
    } catch (error) {
      this.logger.error(`Failed to upload buffer to S3: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate a pre-signed URL for downloading
   */
  async getPresignedDownloadUrl(
    s3Url: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<string | null> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      if (!bucket || !key) {
        this.logger.error('Invalid S3 URL');
        return null;
      }
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate pre-signed URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Download a file from S3 to local filesystem
   */
  async downloadFile(s3Url: string, localPath: string): Promise<boolean> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      if (!bucket || !key) {
        this.logger.error('Invalid S3 URL');
        return false;
      }
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const response = await this.s3Client.send(command);
      const stream = response.Body as Readable;
      
      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(localPath);
        
        stream.pipe(writeStream)
          .on('error', (error) => {
            this.logger.error(`Error downloading file: ${error.message}`);
            reject(false);
          })
          .on('finish', () => {
            this.logger.log(`Downloaded ${s3Url} to ${localPath}`);
            resolve(true);
          });
      });
    } catch (error) {
      this.logger.error(`Failed to download file from S3: ${error.message}`);
      return false;
    }
  }

  /**
   * Download a file from S3 to buffer
   */
  async downloadToBuffer(s3Url: string): Promise<Buffer | null> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      if (!bucket || !key) {
        this.logger.error('Invalid S3 URL');
        return null;
      }
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const response = await this.s3Client.send(command);
      const stream = response.Body as Readable;
      
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (error) => {
          this.logger.error(`Error downloading to buffer: ${error.message}`);
          reject(null);
        });
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      this.logger.error(`Failed to download to buffer: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(s3Url: string): Promise<boolean> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      if (!bucket || !key) {
        this.logger.error('Invalid S3 URL');
        return false;
      }
      
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      this.logger.log(`Deleted ${s3Url} from S3`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(s3Url: string): Promise<boolean> {
    try {
      const { bucket, key } = this.parseS3Url(s3Url);
      
      if (!bucket || !key) {
        return false;
      }
      
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      this.logger.error(`Error checking file existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate S3 key with proper structure
   */
  private generateS3Key(fileName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${this.videoPrefix}${year}/${month}/${day}/${fileName}`;
  }

  /**
   * Parse S3 URL to extract bucket and key
   */
  private parseS3Url(s3Url: string): { bucket: string | null; key: string | null } {
    // Handle s3:// URLs
    if (s3Url.startsWith('s3://')) {
      const matches = s3Url.match(/^s3:\/\/([^\/]+)\/(.+)$/);
      if (matches) {
        return { bucket: matches[1], key: matches[2] };
      }
    }
    
    // Handle https:// S3 URLs
    if (s3Url.includes('.s3.') && s3Url.includes('.amazonaws.com')) {
      const matches = s3Url.match(/^https:\/\/([^\.]+)\.s3\.[^\.]+\.amazonaws\.com\/(.+)$/);
      if (matches) {
        return { bucket: matches[1], key: matches[2] };
      }
    }
    
    return { bucket: null, key: null };
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    
    const contentTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.flv': 'video/x-flv',
      '.wmv': 'video/x-ms-wmv',
      '.m4v': 'video/x-m4v',
      '.3gp': 'video/3gpp',
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Check if S3 storage is properly configured
   */
  isConfigured(): boolean {
    return !!this.bucket;
  }

  /**
   * Generate HTTPS URL for S3 object
   */
  private generateHttpsUrl(key: string): string {
    const endpoint = this.configService.get<string>('S3_ENDPOINT', '');
    
    if (endpoint && endpoint.length > 0) {
      // For MinIO or custom endpoints
      const usePathStyle = this.configService.get<string>('S3_USE_PATH_STYLE', 'false') === 'true';
      if (usePathStyle) {
        return `${endpoint}/${this.bucket}/${key}`;
      } else {
        return `${endpoint.replace('://', `://${this.bucket}.`)}/${key}`;
      }
    } else {
      // For AWS S3
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    }
  }
}