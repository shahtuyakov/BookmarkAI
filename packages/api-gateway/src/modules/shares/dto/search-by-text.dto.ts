import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, IsEnum, IsDateString, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { Platform } from '../constants/platform.enum';

export class SearchFiltersDto {
  @ApiProperty({
    description: 'Filter by platform',
    enum: Platform,
    required: false
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({
    description: 'Filter by content type',
    required: false,
    example: 'article'
  })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiProperty({
    description: 'Filter by start date (inclusive)',
    required: false,
    example: '2024-01-01T00:00:00Z'
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    description: 'Filter by end date (inclusive)',
    required: false,
    example: '2024-12-31T23:59:59Z'
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class SearchByTextDto {
  @ApiProperty({
    description: 'Search query text',
    example: 'machine learning tutorials',
    minLength: 3,
    maxLength: 500
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  query: string;

  @ApiProperty({
    description: 'Search filters',
    type: SearchFiltersDto,
    required: false
  })
  @IsOptional()
  @Type(() => SearchFiltersDto)
  filters?: SearchFiltersDto;

  @ApiProperty({
    description: 'Number of results to return',
    minimum: 1,
    maximum: 100,
    default: 20,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiProperty({
    description: 'Minimum similarity score (0-1)',
    minimum: 0,
    maximum: 1,
    default: 0.7,
    required: false
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(1)
  minSimilarity?: number = 0.7;

  @ApiProperty({
    description: 'Cursor for pagination (similarity score from previous page)',
    required: false,
    example: '0.85'
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}