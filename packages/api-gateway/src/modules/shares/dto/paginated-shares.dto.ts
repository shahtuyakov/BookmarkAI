import { ApiProperty } from '@nestjs/swagger';
import { ShareDto } from './share.dto';

/**
 * DTO for paginated share responses
 */
export class PaginatedSharesDto {
  @ApiProperty({
    description: 'Array of shares',
    type: [ShareDto],
  })
  items: ShareDto[];

  @ApiProperty({
    description: 'Cursor for the next page',
    example: '2025-05-17T12:34:56.789Z_123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  cursor?: string;

  @ApiProperty({
    description: 'Whether there are more items available',
    example: true,
  })
  hasMore: boolean;

  @ApiProperty({
    description: 'Number of items returned',
    example: 20,
  })
  limit: number;
}