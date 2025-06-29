import { ApiProperty } from '@nestjs/swagger';
import { ShareDto } from './share.dto';
import { Platform } from '../constants/platform.enum';

export class SimilarShareDto {
  @ApiProperty({
    description: 'Unique identifier of the share',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  shareId: string;

  @ApiProperty({
    description: 'Unique identifier of the embedding',
    example: '123e4567-e89b-12d3-a456-426614174001'
  })
  embeddingId: string;

  @ApiProperty({
    description: 'Similarity score (0-1, where 1 is identical)',
    example: 0.92,
    minimum: 0,
    maximum: 1
  })
  similarity: number;

  @ApiProperty({
    description: 'URL of the bookmarked content',
    example: 'https://example.com/article'
  })
  url: string;

  @ApiProperty({
    description: 'Title of the content',
    example: 'Introduction to Machine Learning',
    nullable: true
  })
  title: string | null;

  @ApiProperty({
    description: 'Type of content',
    example: 'article'
  })
  contentType: string;

  @ApiProperty({
    description: 'Platform where content was shared',
    enum: Platform,
    example: Platform.GENERIC
  })
  platform: Platform;

  @ApiProperty({
    description: 'Thumbnail URL',
    example: 'https://example.com/thumb.jpg',
    nullable: true
  })
  thumbnailUrl: string | null;

  @ApiProperty({
    description: 'Content preview (truncated)',
    example: 'This article introduces the basic concepts of machine learning...',
    nullable: true,
    required: false
  })
  contentPreview?: string;

  @ApiProperty({
    description: 'Highlighted text snippets matching the search',
    type: [String],
    example: ['machine learning basics', 'neural networks'],
    required: false
  })
  highlights?: string[];

  @ApiProperty({
    description: 'When the share was created',
    example: '2024-01-15T10:30:00Z'
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the share was processed',
    example: '2024-01-15T10:31:00Z',
    nullable: true
  })
  processedAt: Date | null;
}

export class PaginatedSimilarSharesDto {
  @ApiProperty({
    description: 'List of similar shares',
    type: [SimilarShareDto]
  })
  items: SimilarShareDto[];

  @ApiProperty({
    description: 'Whether there are more results',
    example: true
  })
  hasMore: boolean;

  @ApiProperty({
    description: 'Cursor for next page (similarity score)',
    example: '0.75',
    nullable: true
  })
  cursor: string | null;

  @ApiProperty({
    description: 'Total number of results (not provided for performance)',
    example: null,
    nullable: true
  })
  total: number | null;
}