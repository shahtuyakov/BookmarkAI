import {
  Controller,
  Get,
  Query,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MLAnalyticsService } from '../services/ml-analytics.service';
import { MLProducerService } from '../ml-producer.service';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CostSummaryDto,
  DetailedCostsResponseDto,
  MLResultSummaryDto,
  BudgetStatusDto,
} from '../dto/analytics.dto';

@ApiTags('ML Analytics')
@Controller('ml/analytics')
@ApiBearerAuth()
@Roles('admin')
export class MLAnalyticsController {
  constructor(
    private readonly mlAnalyticsService: MLAnalyticsService,
    @Inject('MLProducerService') private readonly mlProducerService: MLProducerService,
  ) {}

  @Get('transcription/costs')
  @ApiOperation({ summary: 'Get transcription cost summary' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Number of hours to look back (default: 24)' })
  @ApiResponse({ status: 200, description: 'Cost summary retrieved successfully', type: CostSummaryDto })
  async getTranscriptionCostSummary(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ): Promise<CostSummaryDto> {
    if (hours < 1 || hours > 720) {
      throw new HttpException('Hours must be between 1 and 720', HttpStatus.BAD_REQUEST);
    }
    return this.mlAnalyticsService.getTranscriptionCostSummary(hours);
  }

  @Get('transcription/costs/detailed')
  @ApiOperation({ summary: 'Get detailed transcription costs' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Number of hours to look back (default: 24)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results to return (default: 100)' })
  @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of results to skip (default: 0)' })
  @ApiResponse({ status: 200, description: 'Detailed costs retrieved successfully', type: DetailedCostsResponseDto })
  async getDetailedTranscriptionCosts(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ): Promise<DetailedCostsResponseDto> {
    if (hours < 1 || hours > 720) {
      throw new HttpException('Hours must be between 1 and 720', HttpStatus.BAD_REQUEST);
    }
    if (limit < 1 || limit > 1000) {
      throw new HttpException('Limit must be between 1 and 1000', HttpStatus.BAD_REQUEST);
    }
    return this.mlAnalyticsService.getDetailedTranscriptionCosts(hours, limit, offset);
  }

  @Get('tasks/summary')
  @ApiOperation({ summary: 'Get ML task summary across all types' })
  @ApiQuery({ name: 'hours', required: false, type: Number, description: 'Number of hours to look back (default: 24)' })
  @ApiResponse({ status: 200, description: 'Task summary retrieved successfully', type: [MLResultSummaryDto] })
  async getMLTaskSummary(
    @Query('hours', new DefaultValuePipe(24), ParseIntPipe) hours: number,
  ): Promise<MLResultSummaryDto[]> {
    if (hours < 1 || hours > 720) {
      throw new HttpException('Hours must be between 1 and 720', HttpStatus.BAD_REQUEST);
    }
    return this.mlAnalyticsService.getMLTaskSummary(hours);
  }

  @Get('budget/status')
  @ApiOperation({ summary: 'Get current budget status' })
  @ApiResponse({ status: 200, description: 'Budget status retrieved successfully', type: BudgetStatusDto })
  async getBudgetStatus(): Promise<BudgetStatusDto> {
    return this.mlAnalyticsService.getBudgetStatus();
  }

  @Get('transcription/result/:shareId')
  @ApiOperation({ summary: 'Get transcription result for a specific share' })
  @ApiResponse({ status: 200, description: 'Transcription result retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Transcription result not found' })
  @Roles() // This overrides the class-level admin restriction, allowing any authenticated user
  async getTranscriptionResult(@Param('shareId') shareId: string) {
    const result = await this.mlAnalyticsService.getTranscriptionResult(shareId);
    if (!result) {
      throw new HttpException('Transcription result not found', HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Get('health')
  @ApiOperation({ summary: 'Get ML producer health status' })
  @ApiResponse({ 
    status: 200, 
    description: 'Health status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        healthy: { type: 'boolean' },
        rabbitmq: {
          type: 'object',
          properties: {
            connectionState: { type: 'string' },
            reconnectAttempts: { type: 'number' },
            consecutiveFailures: { type: 'number' },
            circuitBreakerOpen: { type: 'boolean' },
          },
        },
      },
    },
  })
  @Roles('admin')
  async getHealthStatus() {
    const isHealthy = await this.mlProducerService.isHealthy();
    const status = this.mlProducerService.getStatus();
    
    return {
      healthy: isHealthy,
      rabbitmq: status,
    };
  }
}