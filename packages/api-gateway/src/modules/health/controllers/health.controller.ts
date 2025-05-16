import { Controller, Get, HttpStatus, HttpCode, Res, Injectable, Logger } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { Public } from '../../auth/decorators/public.decorator';
import { DrizzleService } from '../../../database/services/drizzle.service';
import { ConfigService } from '../../../config/services/config.service';
import * as Redis from 'ioredis';

@Controller('health')
@Injectable()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly redis: Redis.Redis;

  constructor(
    private readonly db: DrizzleService,
    private readonly configService: ConfigService
  ) {
    // Initialize Redis client for health checks
    this.redis = new Redis.Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
      // Short connection timeout for health checks
      connectTimeout: 2000,
      // Don't auto-retry on connection failure for health checks
      maxRetriesPerRequest: 1,
    });

    // Handle Redis connection errors
    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(@Res() response: FastifyReply) {
    this.logger.log('Health check initiated');
    
    // Check all components in parallel
    const [dbStatus, redisStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    // Determine overall status
    const isHealthy = dbStatus.status === 'up' && redisStatus.status === 'up';
    const overallStatus = isHealthy ? 'healthy' : 'unhealthy';
    
    // Build response
    const healthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database: dbStatus,
        redis: redisStatus,
      }
    };

    // Set appropriate HTTP status code based on health
    const statusCode = isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    
    // Log health check results
    this.logger.log(`Health check completed with status: ${overallStatus}`);
    
    // Send response
    return response
      .status(statusCode)
      .send(healthResponse);
  }

  private async checkDatabase() {
    try {
      const startTime = performance.now();
      await this.db.query('SELECT 1');
      const responseTime = Math.round(performance.now() - startTime);
      
      return { 
        status: 'up',
        responseTime: `${responseTime}ms` 
      };
    } catch (error) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return { 
        status: 'down', 
        error: error.message 
      };
    }
  }

  private async checkRedis() {
    try {
      const startTime = performance.now();
      // Use PING command to check Redis connectivity
      const pong = await this.redis.ping();
      const responseTime = Math.round(performance.now() - startTime);
      
      return { 
        status: pong === 'PONG' ? 'up' : 'down',
        responseTime: `${responseTime}ms` 
      };
    } catch (error) {
      this.logger.error(`Redis health check failed: ${error.message}`);
      return { 
        status: 'down', 
        error: error.message 
      };
    }
  }
}