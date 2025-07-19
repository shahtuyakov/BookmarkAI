import { 
  Controller, 
  Get, 
  Query, 
  Param, 
  ParseUUIDPipe,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { 
  ApiTags, 
  ApiOperation, 
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { EnrichedSharesService } from '../services/enriched-shares.service';
import { GetEnrichedSharesQueryDto } from '../dto/get-enriched-shares-query.dto';
import { EnrichedShareDto, PaginatedEnrichedSharesDto } from '../dto/enriched-share.dto';
import { ApiResponse } from '../interfaces/api-response.interface';
import { SwaggerResponse } from '../decorators/swagger-response.decorator';

@ApiTags('Enriched Shares')
@Controller('shares/enriched')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EnrichedSharesController {
  constructor(
    private readonly enrichedSharesService: EnrichedSharesService,
  ) {}

  /**
   * Get paginated list of shares with ML results
   */
  @Get()
  @ApiOperation({ 
    summary: 'Get paginated list of shares with ML results',
    description: 'Returns shares with their ML processing results (summaries, transcripts) in a single response',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of items per page (1-100)', example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'Pagination cursor' })
  @ApiQuery({ name: 'platform', required: false, type: String, description: 'Filter by platform(s), comma-separated', example: 'tiktok,youtube' })
  @ApiQuery({ name: 'mlStatus', required: false, enum: ['complete', 'partial', 'none', 'failed'], description: 'Filter by ML processing status' })
  @ApiQuery({ name: 'mediaType', required: false, enum: ['video', 'image', 'audio', 'none'], description: 'Filter by media type' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by share status, comma-separated', example: 'done,processing' })
  @ApiQuery({ name: 'hasTranscript', required: false, type: Boolean, description: 'Only return shares with transcripts' })
  @ApiQuery({ name: 'since', required: false, type: String, description: 'Only return shares created after this date', example: '2024-01-01' })
  @SwaggerResponse({ 
    status: HttpStatus.OK, 
    description: 'List of enriched shares', 
    type: PaginatedEnrichedSharesDto,
  })
  async getEnrichedShares(
    @Query() query: GetEnrichedSharesQueryDto,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<PaginatedEnrichedSharesDto>> {
    return this.enrichedSharesService.getEnrichedShares(user.id, query);
  }

  /**
   * Get a specific share by ID with ML results
   */
  @Get(':id')
  @ApiOperation({ 
    summary: 'Get a specific share by ID with ML results',
    description: 'Returns a single share with all its ML processing results',
  })
  @ApiParam({ name: 'id', type: String, description: 'Share ID' })
  @SwaggerResponse({ 
    status: HttpStatus.OK, 
    description: 'Enriched share details', 
    type: EnrichedShareDto,
  })
  @SwaggerResponse({ 
    status: HttpStatus.NOT_FOUND, 
    description: 'Share not found',
  })
  async getEnrichedShareById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { id: string },
  ): Promise<ApiResponse<EnrichedShareDto>> {
    return this.enrichedSharesService.getEnrichedShareById(id, user.id);
  }
}