import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { WorkflowService, WorkflowState } from '../services/workflow.service';
import { successResponse } from '../interfaces/api-response.interface';

/**
 * Controller for workflow management endpoints
 */
@ApiTags('Workflow')
@Controller('v1/shares/workflow')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
  ) {}

  /**
   * Get workflow statistics
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get workflow statistics for the current user' })
  @ApiResponse({ status: 200, description: 'Workflow statistics retrieved successfully' })
  async getWorkflowStats(@CurrentUser() user: any) {
    const stats = await this.workflowService.getWorkflowStats(user.userId);
    return successResponse(stats);
  }

  /**
   * Get shares by workflow state
   */
  @Get('state/:state')
  @ApiOperation({ summary: 'Get shares in a specific workflow state' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results to return' })
  @ApiResponse({ status: 200, description: 'Shares retrieved successfully' })
  async getSharesByWorkflowState(
    @Param('state') state: string,
    @Query('limit') limit?: string,
  ) {
    // Validate workflow state
    if (!Object.values(WorkflowState).includes(state as WorkflowState)) {
      throw new BadRequestException(`Invalid workflow state: ${state}`);
    }

    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const shares = await this.workflowService.getSharesByWorkflowState(
      state as WorkflowState,
      parsedLimit,
    );

    return successResponse(shares);
  }

  /**
   * Get shares ready for enhancement
   */
  @Get('ready')
  @ApiOperation({ summary: 'Get shares ready for enhancement processing' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of results to return' })
  @ApiResponse({ status: 200, description: 'Shares retrieved successfully' })
  async getSharesReadyForEnhancement(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const shares = await this.workflowService.getSharesForEnhancement(parsedLimit);
    return successResponse(shares);
  }

  /**
   * Retry failed workflows
   */
  @Get('retry-failed')
  @ApiOperation({ summary: 'Retry failed workflow enhancements' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of failed workflows to retry' })
  @ApiResponse({ status: 200, description: 'Failed workflows queued for retry' })
  async retryFailedWorkflows(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const count = await this.workflowService.retryFailedWorkflows(parsedLimit);
    return successResponse({
      message: `${count} failed workflows queued for retry`,
      count,
    });
  }
}