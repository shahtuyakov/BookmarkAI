import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, IsBoolean, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';

export enum MLStatus {
  COMPLETE = 'complete',
  PARTIAL = 'partial',
  NONE = 'none',
  FAILED = 'failed',
}

export enum MediaType {
  VIDEO = 'video',
  IMAGE = 'image',
  AUDIO = 'audio',
  NONE = 'none',
}

/**
 * Query parameters for getting enriched shares
 */
export class GetEnrichedSharesQueryDto {
  @ApiPropertyOptional({
    description: 'Number of items to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 'eyJpZCI6IjEyMzQ1Njc4In0=',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filter by platform(s), comma-separated',
    example: 'tiktok,youtube',
  })
  @IsOptional()
  @Transform(({ value }) => value.split(',').map((p: string) => p.trim()))
  platform?: Platform[];

  @ApiPropertyOptional({
    description: 'Filter by ML processing status',
    enum: MLStatus,
    example: MLStatus.COMPLETE,
  })
  @IsOptional()
  @IsEnum(MLStatus)
  mlStatus?: MLStatus;

  @ApiPropertyOptional({
    description: 'Filter by media type',
    enum: MediaType,
    example: MediaType.VIDEO,
  })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({
    description: 'Filter by share processing status, comma-separated',
    example: 'done,processing',
  })
  @IsOptional()
  @Transform(({ value }) => value.split(',').map((s: string) => s.trim()))
  status?: ShareStatus[];

  @ApiPropertyOptional({
    description: 'Only return shares with transcripts',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasTranscript?: boolean;

  @ApiPropertyOptional({
    description: 'Only return shares created after this date',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  since?: string;
}