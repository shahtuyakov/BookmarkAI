import { Injectable, NestMiddleware, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as Redis from 'ioredis';
import { ConfigService } from '../../../config/services/config.service';
import { ERROR_CODES } from '../constants/error-codes.constant';
import { errorResponse } from '../interfaces/api-response.interface';

/**
 * Rate limiting middleware for share endpoints
 */
@Injectable()
export class SharesRateLimitMiddleware implements NestMiddleware {
  private readonly redis: Redis.Redis;
  private readonly logger = new Logger(SharesRateLimitMiddleware.name);
  private readonly keyPrefix = 'ratelimit:shares';
  private readonly requestsLimit = 10;  // 10 requests
  private readonly windowSeconds = 10;  // per 10 seconds
  
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
    try {
      // Only apply to POST requests
      if (req.method !== 'POST') {
        return next();
      }
      
      // Extract user ID from JWT
      const user = req.user as { id: string } | undefined;
      
      if (!user || !user.id) {
        // If no user, apply IP-based rate limiting
        return this.applyIpBasedRateLimit(req, res, next);
      }
      
      // Apply user-based rate limiting
      return this.applyUserBasedRateLimit(user.id, req, res, next);
    } catch (error) {
      this.logger.error(`Rate limit error: ${error.message}`, error.stack);
      next(error);
    }
  }
  
  /**
   * Apply rate limiting based on IP address
   */
  private async applyIpBasedRateLimit(req: Request, res: Response, next: NextFunction) {
    const ip = this.getIpAddress(req);
    const key = `${this.keyPrefix}:ip:${ip}`;
    
    return this.checkRateLimit(key, res, next);
  }
  
  /**
   * Apply rate limiting based on user ID
   */
  private async applyUserBasedRateLimit(userId: string, req: Request, res: Response, next: NextFunction) {
    const key = `${this.keyPrefix}:user:${userId}`;
    
    return this.checkRateLimit(key, res, next);
  }
  
  /**
   * Check if the rate limit has been exceeded
   */
  private async checkRateLimit(key: string, res: Response, next: NextFunction) {
    const current = await this.redis.incr(key);
    
    // Set expiry on first request
    if (current === 1) {
      await this.redis.expire(key, this.windowSeconds);
    }
    
    // Add rate limit headers - updated for Fastify
    // In Fastify, we need to use setHeader instead of header
    res.setHeader('X-RateLimit-Limit', String(this.requestsLimit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.requestsLimit - current)));
    
    // Get TTL for the key
    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      res.setHeader('X-RateLimit-Reset', String(ttl));
    }
    
    // Check if limit exceeded
    if (current > this.requestsLimit) {
      this.logger.warn(`Rate limit exceeded for key: ${key}`);
      
      // Set rate limit headers for 429 response
      res.setHeader('Retry-After', String(ttl > 0 ? ttl : this.windowSeconds));
      
      const response = errorResponse(
        ERROR_CODES.SERVER_ERROR,
        'Too many requests. Please try again later.'
      );
      
      throw new HttpException(response, HttpStatus.TOO_MANY_REQUESTS);
    }
    
    next();
  }
  
  /**
   * Get client IP address from request
   */
  private getIpAddress(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      return Array.isArray(forwardedFor) 
        ? forwardedFor[0] 
        : forwardedFor.split(',')[0].trim();
    }
    
    return req.ip || '127.0.0.1';
  }
}