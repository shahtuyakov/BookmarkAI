import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { SearchFiltersDto } from './search-by-text.dto';

export class SearchByIdDto {
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
    description: 'Exclude the source share from results',
    default: true,
    required: false
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  excludeSelf?: boolean = true;
}