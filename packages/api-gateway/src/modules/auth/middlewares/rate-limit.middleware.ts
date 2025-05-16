import { Injectable, NestMiddleware, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as Redis from 'ioredis';
import { ConfigService } from '../../../config/services/config.service';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly redis: Redis.Redis;
  private readonly logger = new Logger(RateLimitMiddleware.name);
  
  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis.Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get('REDIS_PORT', 6379),
    });
  }
  
  /**
   * Middleware implementation for rate limiting
   */
  async use(req: Request, res: Response, next: NextFunction) {
    const ip = this.getIpAddress(req);
    const endpoint = req.path;
    const email = req.body?.email;
    
    try {
      // IP-based rate limit (10 requests per minute)
      const ipKey = `ratelimit:ip:${ip}:${endpoint}`;
      const ipCount = await this.redis.incr(ipKey);
      
      // Set expiry on first request
      if (ipCount === 1) {
        await this.redis.expire(ipKey, 60); // 1 minute
      }
      
      // If IP exceeds limit, block request
      if (ipCount > 10) {
        this.logger.warn(`Rate limit exceeded for IP ${ip} on ${endpoint}`);
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
      }
      
      // If this is a login/register request with an email, apply user-specific rate limiting
      if (email && (endpoint === '/auth/login' || endpoint === '/auth/register')) {
        const emailKey = `ratelimit:email:${email}:${endpoint}`;
        const emailCount = await this.redis.incr(emailKey);
        
        // Set expiry on first request (10 minutes for email-based limits)
        if (emailCount === 1) {
          await this.redis.expire(emailKey, 600); // 10 minutes
        }
        
        // After 3 failed attempts, rate limit more aggressively
        if (emailCount > 3) {
          this.logger.warn(`Rate limit exceeded for email ${email} on ${endpoint}`);
          
          // Track for monitoring
          await this.redis.incr(`auth:failed:${email}`);
          
          throw new HttpException('Too many attempts, please try again later', HttpStatus.TOO_MANY_REQUESTS);
        }
      }
      
      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      this.logger.error(`Rate limit error: ${error.message}`);
      next(error);
    }
  }
  
  /**
   * Get client IP address from request
   */
  private getIpAddress(req: Request): string {
    // Try different headers for IP address
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return Array.isArray(forwardedFor) 
        ? forwardedFor[0] 
        : forwardedFor.split(',')[0].trim();
    }
    
    return req.ip || '127.0.0.1';
  }
}