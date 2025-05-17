import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, Min, Max, IsInt, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { Platform } from '../constants/platform.enum';
import { ShareStatus } from '../constants/share-status.enum';

/**
 * DTO for share listing query parameters
 */
export class GetSharesQueryDto {
  @ApiProperty({
    description: 'Cursor for pagination',
    required: false,
    example: '2025-05-17T12:34:56.789Z_123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiProperty({
    description: 'Number of items to return',
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiProperty({
    description: 'Filter by platform',
    required: false,
    enum: Platform,
  })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiProperty({
    description: 'Filter by status',
    required: false,
    enum: ShareStatus,
  })
  @IsOptional()
  @IsEnum(ShareStatus)
  status?: ShareStatus;
}