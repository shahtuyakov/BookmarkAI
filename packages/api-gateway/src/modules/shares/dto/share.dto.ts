import { ApiProperty } from '@nestjs/swagger';
import { Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';

/**
 * DTO for share response
 */
export class ShareDto {
  @ApiProperty({
    description: 'Share ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'URL of the shared content',
    example: 'https://www.tiktok.com/@username/video/1234567890',
  })
  url: string;

  @ApiProperty({
    description: 'Platform the content is from',
    enum: Platform,
    example: Platform.TIKTOK,
  })
  platform: Platform;

  @ApiProperty({
    description: 'Status of the share processing',
    enum: ShareStatus,
    example: ShareStatus.PENDING,
  })
  status: ShareStatus;

  @ApiProperty({
    description: 'Title of the shared content',
    example: 'Amazing TikTok Video',
    required: false,
  })
  title?: string;

  @ApiProperty({
    description: 'Description of the shared content',
    example: 'This is a funny video about cats',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Author of the content',
    example: 'johndoe',
    required: false,
  })
  author?: string;

  @ApiProperty({
    description: 'Thumbnail URL',
    example: 'https://example.com/thumbnail.jpg',
    required: false,
  })
  thumbnailUrl?: string;

  @ApiProperty({
    description: 'Media URL',
    example: 'https://example.com/video.mp4',
    required: false,
  })
  mediaUrl?: string;

  @ApiProperty({
    description: 'Type of media',
    enum: ['video', 'image', 'audio', 'none'],
    example: 'video',
    required: false,
  })
  mediaType?: string;

  @ApiProperty({
    description: 'Platform-specific data',
    type: 'object',
    required: false,
  })
  platformData?: any;

  @ApiProperty({
    description: 'When the share was created',
    example: '2025-05-17T12:34:56.789Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the share was last updated',
    example: '2025-05-17T12:34:56.789Z',
  })
  updatedAt: Date;
}