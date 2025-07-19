import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareDto } from './share.dto';

/**
 * ML processing status enum
 */
export enum MLProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
  NOT_APPLICABLE = 'not_applicable',
}

/**
 * ML results for a share
 */
export class MLResultsDto {
  @ApiPropertyOptional({
    description: 'AI-generated summary of the content',
    example: 'This video demonstrates a cooking technique for...',
  })
  summary?: string;

  @ApiPropertyOptional({
    description: 'Key points extracted from the content',
    example: ['Use fresh ingredients', 'Cook at medium heat', 'Season to taste'],
    type: [String],
  })
  keyPoints?: string[];

  @ApiPropertyOptional({
    description: 'Transcript of audio/video content',
    example: 'Hello everyone, today we are going to...',
  })
  transcript?: string;

  @ApiPropertyOptional({
    description: 'Detected language of the content',
    example: 'en',
  })
  language?: string;

  @ApiPropertyOptional({
    description: 'Duration of audio/video in seconds',
    example: 180,
  })
  duration?: number;

  @ApiPropertyOptional({
    description: 'Whether embeddings have been generated',
    example: true,
  })
  hasEmbeddings?: boolean;

  @ApiProperty({
    description: 'Processing status for each ML task',
    example: {
      summary: 'done',
      transcript: 'done',
      embeddings: 'processing',
    },
  })
  processingStatus: {
    summary: MLProcessingStatus;
    transcript: MLProcessingStatus;
    embeddings: MLProcessingStatus;
  };

  @ApiPropertyOptional({
    description: 'Timestamps when each ML task was processed',
    example: {
      summary: '2025-01-18T12:34:56.789Z',
      transcript: '2025-01-18T12:33:45.123Z',
    },
  })
  processedAt?: {
    summary?: string;
    transcript?: string;
    embeddings?: string;
  };

  @ApiPropertyOptional({
    description: 'Error messages for failed ML tasks',
    example: {
      transcript: 'Audio file corrupted',
    },
  })
  error?: {
    summary?: string;
    transcript?: string;
    embeddings?: string;
  };
}

/**
 * Share with ML results included
 */
export class EnrichedShareDto extends ShareDto {
  @ApiPropertyOptional({
    description: 'ML processing results',
    type: MLResultsDto,
  })
  mlResults?: MLResultsDto;
}

/**
 * Paginated response for enriched shares
 */
export class PaginatedEnrichedSharesDto {
  @ApiProperty({
    description: 'List of enriched shares',
    type: [EnrichedShareDto],
  })
  items: EnrichedShareDto[];

  @ApiPropertyOptional({
    description: 'Cursor for next page',
    example: 'eyJpZCI6IjEyMzQ1Njc4In0=',
  })
  cursor?: string;

  @ApiProperty({
    description: 'Whether more items exist',
    example: true,
  })
  hasMore: boolean;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  limit: number;
}