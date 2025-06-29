import { Controller, Get, Header, Res, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Public } from '../../auth/decorators/public.decorator';
import { MLMetricsService } from '../services/ml-metrics.service';

/**
 * Controller for exposing ML Producer Prometheus metrics
 */
@ApiTags('metrics')
@Controller('ml/metrics')
export class MLMetricsController {
  constructor(private readonly metricsService: MLMetricsService) {}

  /**
   * Prometheus metrics endpoint
   */
  @Public()
  @Get('prometheus')
  @ApiOperation({ 
    summary: 'Get Prometheus metrics for ML Producer',
    description: 'Returns metrics in Prometheus text format for ML Producer operations including task publishing, connection state, and circuit breaker status.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Prometheus metrics in text format',
    content: {
      'text/plain': {
        example: `# HELP ml_producer_tasks_sent_total Total number of ML tasks sent to RabbitMQ
# TYPE ml_producer_tasks_sent_total counter
ml_producer_tasks_sent_total{task_type="summarize_llm",status="success"} 42
ml_producer_tasks_sent_total{task_type="transcribe_whisper",status="success"} 156
ml_producer_tasks_sent_total{task_type="embed_vectors",status="success"} 89

# HELP ml_producer_connection_state Current RabbitMQ connection state
# TYPE ml_producer_connection_state gauge
ml_producer_connection_state{state="CONNECTED"} 1
ml_producer_connection_state{state="DISCONNECTED"} 0`
      }
    }
  })
  async getPrometheusMetrics(@Res() response: FastifyReply): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    
    // Send raw Prometheus metrics, bypassing the response envelope interceptor
    await response
      .status(HttpStatus.OK)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(metrics);
  }

  /**
   * JSON metrics endpoint for debugging
   */
  @Public()
  @Get('json')
  @ApiOperation({ 
    summary: 'Get ML Producer metrics in JSON format',
    description: 'Returns current ML Producer metrics in JSON format for debugging and monitoring dashboards.'
  })
  @ApiResponse({
    status: 200,
    description: 'ML Producer metrics',
    schema: {
      example: {
        success: true,
        data: {
          tasks: {
            sent: {
              summarize_llm: { success: 42, failure: 3, timeout: 1 },
              transcribe_whisper: { success: 156, failure: 12, timeout: 0 },
              embed_vectors: { success: 89, failure: 5, timeout: 2 }
            },
            retries: {
              summarize_llm: 5,
              transcribe_whisper: 18,
              embed_vectors: 7
            }
          },
          connection: {
            state: 'CONNECTED',
            reconnectAttempts: 2,
            errors: {
              'Connection timeout': 3,
              'Channel closed': 1
            }
          },
          circuitBreaker: {
            state: 'closed',
            trips: 0
          },
          performance: {
            avgPublishDuration: {
              summarize_llm: 0.045,
              transcribe_whisper: 0.052,
              embed_vectors: 0.041
            },
            avgMessageSize: {
              summarize_llm: 2456,
              transcribe_whisper: 1024,
              embed_vectors: 8192
            }
          }
        },
        meta: {
          timestamp: '2024-06-29T12:00:00Z',
          uptime: 3600
        }
      }
    }
  })
  async getMLProducerMetrics() {
    // For now, return a simple status
    // In a full implementation, this would parse the Prometheus metrics
    // and return them in a more structured JSON format
    const prometheusText = await this.metricsService.getMetrics();
    
    // Extract some basic metrics from the text
    const lines = prometheusText.split('\n');
    const metrics: any = {
      tasks: { sent: {}, retries: {} },
      connection: { errors: {} },
      circuitBreaker: {},
      performance: { avgPublishDuration: {}, avgMessageSize: {} }
    };

    // Parse metrics (simplified for MVP)
    for (const line of lines) {
      if (line.startsWith('ml_producer_tasks_sent_total')) {
        // Extract task counts
        const match = line.match(/task_type="([^"]+)",status="([^"]+)"} (\d+)/);
        if (match) {
          const [, taskType, status, count] = match;
          if (!metrics.tasks.sent[taskType]) {
            metrics.tasks.sent[taskType] = {};
          }
          metrics.tasks.sent[taskType][status] = parseInt(count);
        }
      }
      // Add more parsing as needed
    }

    return {
      success: true,
      data: metrics,
      meta: {
        timestamp: new Date().toISOString(),
        contentType: this.metricsService.getContentType()
      }
    };
  }
}