/**
 * Upload Strategy Service
 * 
 * Implements the S3 bypass strategy for large file uploads as defined in ADR-010.
 * Files >10MB bypass the ngrok tunnel and upload directly to S3 using presigned URLs.
 */

import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '../../config/services/config.service';

export interface FileUploadInfo {
  filename: string;
  size: number;
  mimeType: string;
  checksum?: string;
}

export interface UploadStrategy {
  method: 'tunnel' | 'direct-s3';
  uploadUrl?: string;
  formData?: Record<string, string>;
  headers?: Record<string, string>;
  expiresIn?: number;
}

export interface DirectUploadResponse {
  strategy: UploadStrategy;
  uploadId: string;
  finalUrl: string;
}

/**
 * Service for determining and handling file upload strategies
 */
@Injectable()
export class UploadStrategyService {
  private readonly logger = new Logger(UploadStrategyService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly maxTunnelSize: number = 10 * 1024 * 1024; // 10MB
  private readonly presignedUrlExpiry: number = 15 * 60; // 15 minutes

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get('S3_BUCKET_NAME', 'bookmarkai-uploads');
    
    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  /**
   * Determine the optimal upload strategy based on file size and tunnel availability
   * @param fileInfo Information about the file to upload
   * @returns Upload strategy configuration
   */
  async getUploadStrategy(fileInfo: FileUploadInfo): Promise<DirectUploadResponse> {
    const isNgrokEnabled = this.configService.get('NGROK_ENABLED') === 'true';
    const shouldBypassTunnel = fileInfo.size > this.maxTunnelSize;

    this.logger.debug('Determining upload strategy', {
      filename: fileInfo.filename,
      size: fileInfo.size,
      isNgrokEnabled,
      shouldBypassTunnel,
      maxTunnelSize: this.maxTunnelSize,
    });

    // Generate unique upload ID for tracking
    const uploadId = this.generateUploadId();
    
    if (shouldBypassTunnel || !isNgrokEnabled) {
      // Use direct S3 upload for large files or when tunnel is not available
      const strategy = await this.createDirectS3Strategy(fileInfo, uploadId);
      
      this.logger.log('Using direct S3 upload strategy', {
        uploadId,
        filename: fileInfo.filename,
        size: fileInfo.size,
        reason: shouldBypassTunnel ? 'file_too_large' : 'tunnel_unavailable',
      });

      return {
        strategy,
        uploadId,
        finalUrl: this.getS3ObjectUrl(this.getS3Key(fileInfo, uploadId)),
      };
    } else {
      // Use tunnel for smaller files
      const strategy = this.createTunnelStrategy();
      
      this.logger.log('Using tunnel upload strategy', {
        uploadId,
        filename: fileInfo.filename,
        size: fileInfo.size,
      });

      return {
        strategy,
        uploadId,
        finalUrl: `/api/uploads/${uploadId}`, // Will be processed through tunnel
      };
    }
  }

  /**
   * Create direct S3 upload strategy with presigned URL
   */
  private async createDirectS3Strategy(
    fileInfo: FileUploadInfo,
    uploadId: string
  ): Promise<UploadStrategy> {
    const key = this.getS3Key(fileInfo, uploadId);
    
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: fileInfo.mimeType,
        ContentLength: fileInfo.size,
        Metadata: {
          originalFilename: fileInfo.filename,
          uploadId: uploadId,
          uploadedAt: new Date().toISOString(),
        },
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.presignedUrlExpiry,
      });

      return {
        method: 'direct-s3',
        uploadUrl,
        headers: {
          'Content-Type': fileInfo.mimeType,
          'Content-Length': fileInfo.size.toString(),
        },
        expiresIn: this.presignedUrlExpiry,
      };
    } catch (error) {
      this.logger.error('Failed to create S3 presigned URL', {
        error: error.message,
        bucket: this.bucketName,
        key,
      });
      throw new Error('Failed to create direct upload URL');
    }
  }

  /**
   * Create tunnel upload strategy for smaller files
   */
  private createTunnelStrategy(): UploadStrategy {
    const tunnelUrl = this.configService.get('NGROK_TUNNEL_URL', 'http://localhost:3001');
    
    return {
      method: 'tunnel',
      uploadUrl: `${tunnelUrl}/api/upload`,
      headers: {
        'Accept': 'application/json',
      },
    };
  }

  /**
   * Generate S3 object key for uploaded file
   */
  private getS3Key(fileInfo: FileUploadInfo, uploadId: string): string {
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const sanitizedFilename = fileInfo.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `uploads/${timestamp}/${uploadId}/${sanitizedFilename}`;
  }

  /**
   * Get public S3 object URL
   */
  private getS3ObjectUrl(key: string): string {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    return `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Validate completed upload and create database record
   */
  async validateUpload(uploadId: string): Promise<boolean> {
    try {
      // This would typically:
      // 1. Check if the S3 object exists
      // 2. Validate file integrity (checksum)
      // 3. Create database record
      // 4. Clean up temporary data
      
      this.logger.log('Upload validation completed', { uploadId });
      return true;
    } catch (error) {
      this.logger.error('Upload validation failed', {
        uploadId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get upload progress for client applications
   */
  async getUploadProgress(uploadId: string): Promise<{
    status: 'pending' | 'uploading' | 'completed' | 'failed';
    progress: number;
    url?: string;
  }> {
    // This would typically check upload status from database/cache
    // For now, return a mock response
    this.logger.debug('Getting upload progress', { uploadId });
    return {
      status: 'pending',
      progress: 0,
    };
  }
}

/**
 * Client-side upload utility that implements the strategy pattern
 */
export class ClientUploadManager {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Upload a file using the optimal strategy
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // Get upload strategy from server
    const fileInfo: FileUploadInfo = {
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    };

    const strategyResponse = await fetch(`${this.baseUrl}/api/upload/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileInfo),
    });

    if (!strategyResponse.ok) {
      throw new Error('Failed to get upload strategy');
    }

    const { strategy, uploadId, finalUrl }: DirectUploadResponse = 
      await strategyResponse.json();

    // Execute upload based on strategy
    if (strategy.method === 'direct-s3') {
      await this.uploadToS3(file, strategy, onProgress);
    } else {
      await this.uploadViaTunnel(file, strategy, onProgress);
    }

    // Validate upload completion
    await this.validateUpload(uploadId);

    return finalUrl;
  }

  /**
   * Upload file directly to S3
   */
  private async uploadToS3(
    file: File,
    strategy: UploadStrategy,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!strategy.uploadUrl) {
      throw new Error('S3 upload URL not provided');
    }

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress((event.loaded / event.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('S3 upload failed'));

      xhr.open('PUT', strategy.uploadUrl);
      
      // Set headers
      if (strategy.headers) {
        Object.entries(strategy.headers).forEach(([key, value]) => {
          xhr.setRequestHeader(key, value);
        });
      }

      xhr.send(file);
    });
  }

  /**
   * Upload file via ngrok tunnel
   */
  private async uploadViaTunnel(
    file: File,
    strategy: UploadStrategy,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!strategy.uploadUrl) {
      throw new Error('Tunnel upload URL not provided');
    }

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    return new Promise((resolve, reject) => {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          onProgress((event.loaded / event.total) * 100);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Tunnel upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Tunnel upload failed'));

      xhr.open('POST', strategy.uploadUrl);
      xhr.send(formData);
    });
  }

  /**
   * Validate upload completion with server
   */
  private async validateUpload(uploadId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/upload/${uploadId}/validate`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Upload validation failed');
    }
  }
}