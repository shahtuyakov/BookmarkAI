import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Public } from '../decorators/public.decorator';
import { AuthMetricsService } from '../services/auth-metrics.service';

/**
 * Controller for exposing Auth Prometheus metrics
 */
@ApiTags('metrics')
@Controller('auth/metrics')
export class AuthMetricsController {
  constructor(private readonly metricsService: AuthMetricsService) {}

  /**
   * Prometheus metrics endpoint
   */
  @Public()
  @Get('prometheus')
  @ApiOperation({ 
    summary: 'Get Prometheus metrics for Authentication',
    description: 'Returns metrics in Prometheus text format for authentication operations including provider success rates, latency, and new user registrations.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        example: `# HELP auth_attempts_total Total number of authentication attempts
# TYPE auth_attempts_total counter
auth_attempts_total{provider="google",auth_type="social"} 150
auth_attempts_total{provider="apple",auth_type="social"} 75
auth_attempts_total{provider="email",auth_type="traditional"} 300

# HELP auth_success_total Total number of successful authentications
# TYPE auth_success_total counter
auth_success_total{provider="google",auth_type="social",is_new_user="false"} 140
auth_success_total{provider="google",auth_type="social",is_new_user="true"} 5

# HELP auth_latency_seconds Authentication latency in seconds
# TYPE auth_latency_seconds histogram
auth_latency_seconds_bucket{provider="google",auth_type="social",le="0.5"} 100
auth_latency_seconds_bucket{provider="google",auth_type="social",le="1"} 140`
      }
    }
  })
  async getPrometheusMetrics(@Res() response: FastifyReply): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    
    // Send raw Prometheus metrics, bypassing the response envelope interceptor
    await response
      .status(HttpStatus.OK)
      .header('Content-Type', this.metricsService.getContentType())
      .send(metrics);
  }
}