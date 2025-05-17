import { 
    Controller, 
    Post, 
    Get, 
    Param, 
    Body, 
    Query, 
    UseGuards, 
    Headers,
    ParseUUIDPipe,
    HttpStatus,
    HttpCode
  } from '@nestjs/common';
  import { 
    ApiTags, 
    ApiOperation, 
    ApiResponse as SwaggerResponse, 
    ApiHeader,
    ApiBearerAuth
  } from '@nestjs/swagger';
  import { SharesService } from '../services/shares.service';
  import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
  import { CurrentUser } from '../decorators/current-user.decorator';
  import { CreateShareDto } from '../dto/create-share.dto';
  import { GetSharesQueryDto } from '../dto/get-shares-query.dto';
  import { ShareDto } from '../dto/share.dto';
  import { PaginatedSharesDto } from '../dto/paginated-shares.dto';
  import { ApiResponse } from '../interfaces/api-response.interface';
  import { PaginatedData } from '../interfaces/paginated-data.interface';
  
  /**
   * Controller for share endpoints
   */
  @ApiTags('shares')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Controller('v1/shares')
  export class SharesController {
    constructor(private readonly sharesService: SharesService) {}
  
    /**
     * Create a new share
     */
    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @ApiOperation({ summary: 'Create a new share' })
    @ApiHeader({
      name: 'Idempotency-Key',
      description: 'Unique key to prevent duplicate submissions',
      required: true,
    })
    @SwaggerResponse({ 
      status: HttpStatus.ACCEPTED, 
      description: 'Share accepted for processing',
      type: ShareDto
    })
    @SwaggerResponse({ 
      status: HttpStatus.BAD_REQUEST, 
      description: 'Invalid request data'
    })
    async createShare(
      @Body() createShareDto: CreateShareDto,
      @CurrentUser() user: { id: string },
      @Headers('idempotency-key') idempotencyKey: string,
    ): Promise<ApiResponse<ShareDto>> {
      return this.sharesService.createShare(createShareDto, user.id, idempotencyKey);
    }
  
    /**
     * Get paginated list of shares
     */
    @Get()
    @ApiOperation({ summary: 'Get paginated list of shares' })
    @SwaggerResponse({ 
      status: HttpStatus.OK, 
      description: 'List of shares', 
      type: PaginatedSharesDto 
    })
    async getShares(
      @Query() query: GetSharesQueryDto,
      @CurrentUser() user: { id: string },
    ): Promise<ApiResponse<PaginatedData<ShareDto>>> {
      return this.sharesService.getShares(user.id, query);
    }
  
    /**
     * Get a specific share by ID
     */
    @Get(':id')
    @ApiOperation({ summary: 'Get a specific share by ID' })
    @SwaggerResponse({ 
      status: HttpStatus.OK, 
      description: 'Share details', 
      type: ShareDto 
    })
    @SwaggerResponse({ 
      status: HttpStatus.NOT_FOUND, 
      description: 'Share not found' 
    })
    async getShareById(
      @Param('id', ParseUUIDPipe) id: string,
      @CurrentUser() user: { id: string },
    ): Promise<ApiResponse<ShareDto>> {
      return this.sharesService.getShareById(id, user.id);
    }
  }