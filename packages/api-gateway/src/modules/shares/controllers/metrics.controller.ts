import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MetricsService } from '../services/metrics.service';

/**
 * Controller for exposing idempotency metrics
 */
@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Get idempotency metrics
   */
  @Get('idempotency')
  @ApiOperation({ summary: 'Get idempotency metrics' })
  getIdempotencyMetrics() {
    const metrics = this.metricsService.getAllMetrics();

    return {
      success: true,
      data: {
        ...metrics,
        // Calculate duplicate prevention rate
        duplicateRate: this.calculateDuplicateRate(metrics.counters),
        // Get P95 response times
        p95ResponseTime: this.metricsService.getHistogramPercentile(
          'idempotency_check_duration_ms',
          95,
        ),
      },
      meta: {
        timestamp: new Date().toISOString(),
        description: 'Idempotency metrics for monitoring duplicate prevention',
      },
    };
  }

  /**
   * Calculate duplicate prevention rate
   */
  private calculateDuplicateRate(counters: Record<string, number>): number {
    const totalRequests = Object.entries(counters)
      .filter(([key]) => key.startsWith('idempotency_requests_total'))
      .reduce((sum, [, value]) => sum + value, 0);

    const duplicatesPrevented = Object.entries(counters)
      .filter(([key]) => key.startsWith('idempotency_duplicates_prevented_total'))
      .reduce((sum, [, value]) => sum + value, 0);

    return totalRequests > 0 ? duplicatesPrevented / totalRequests : 0;
  }
}
