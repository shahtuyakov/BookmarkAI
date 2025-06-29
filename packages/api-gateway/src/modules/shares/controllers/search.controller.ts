import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  Logger
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
  ApiParam
} from '@nestjs/swagger';
import { SearchService } from '../services/search.service';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { SearchByTextDto } from '../dto/search-by-text.dto';
import { SearchByIdDto } from '../dto/search-by-id.dto';
import { PaginatedSimilarSharesDto } from '../dto/similar-share.dto';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * Controller for similarity search endpoints
 */
@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v1/shares')
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  /**
   * Search for similar shares by text query
   */
  @Post('search/similar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Search for similar shares by text',
    description: 'Generates an embedding for the query text and finds similar bookmarks using vector similarity search'
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'List of similar shares',
    type: PaginatedSimilarSharesDto
  })
  @SwaggerResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid search parameters'
  })
  @SwaggerResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized'
  })
  async searchByText(
    @Body() searchDto: SearchByTextDto,
    @CurrentUser() user: { id: string }
  ): Promise<ApiResponse<PaginatedSimilarSharesDto>> {
    this.logger.log(`Text search request from user ${user.id}: "${searchDto.query}"`);

    const startTime = Date.now();
    
    try {
      const results = await this.searchService.searchByText({
        query: searchDto.query,
        userId: user.id,
        filters: searchDto.filters ? {
          platform: searchDto.filters.platform,
          contentType: searchDto.filters.contentType,
          startDate: searchDto.filters.startDate ? new Date(searchDto.filters.startDate) : undefined,
          endDate: searchDto.filters.endDate ? new Date(searchDto.filters.endDate) : undefined
        } : undefined,
        limit: searchDto.limit,
        minSimilarity: searchDto.minSimilarity,
        cursor: searchDto.cursor
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Text search completed in ${duration}ms, found ${results.items.length} results`);

      return {
        success: true,
        data: {
          items: results.items,
          hasMore: results.hasMore,
          cursor: results.cursor || null,
          total: results.total || null
        }
      };
    } catch (error) {
      this.logger.error(`Text search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find shares similar to a specific share
   */
  @Get(':id/similar')
  @ApiOperation({ 
    summary: 'Find shares similar to a specific share',
    description: 'Uses the existing embedding of a share to find other similar bookmarks'
  })
  @ApiParam({
    name: 'id',
    description: 'Share ID to find similar shares for',
    type: 'string',
    format: 'uuid'
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'List of similar shares',
    type: PaginatedSimilarSharesDto
  })
  @SwaggerResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Share not found or no embedding available'
  })
  @SwaggerResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized'
  })
  async searchByShareId(
    @Param('id', ParseUUIDPipe) shareId: string,
    @Query() searchDto: SearchByIdDto,
    @CurrentUser() user: { id: string }
  ): Promise<ApiResponse<PaginatedSimilarSharesDto>> {
    this.logger.log(`Similar shares search for share ${shareId} by user ${user.id}`);

    const startTime = Date.now();

    try {
      const results = await this.searchService.searchByShareId({
        shareId,
        userId: user.id,
        filters: searchDto.filters ? {
          platform: searchDto.filters.platform,
          contentType: searchDto.filters.contentType,
          startDate: searchDto.filters.startDate ? new Date(searchDto.filters.startDate) : undefined,
          endDate: searchDto.filters.endDate ? new Date(searchDto.filters.endDate) : undefined
        } : undefined,
        limit: searchDto.limit,
        minSimilarity: searchDto.minSimilarity,
        excludeSelf: searchDto.excludeSelf
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Similar shares search completed in ${duration}ms, found ${results.items.length} results`);

      return {
        success: true,
        data: {
          items: results.items,
          hasMore: results.hasMore,
          cursor: results.cursor || null,
          total: results.total || null
        }
      };
    } catch (error) {
      this.logger.error(`Similar shares search failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Batch search for multiple queries (future implementation)
   */
  @Post('search/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Batch search for multiple queries',
    description: 'Efficiently search for similar shares using multiple queries (useful for digest generation)'
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Map of query to results'
  })
  @SwaggerResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid search parameters'
  })
  @SwaggerResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Unauthorized'
  })
  async searchBatch(
    @Body() batchDto: { queries: string[]; filters?: any; limit?: number },
    @CurrentUser() user: { id: string }
  ): Promise<ApiResponse<any>> {
    // TODO: Implement batch search
    this.logger.log(`Batch search request from user ${user.id} with ${batchDto.queries.length} queries`);
    
    return {
      success: true,
      data: {}
    };
  }
}