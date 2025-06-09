import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to ensure all requests have a unique request ID
 * Follows the X-Request-ID header pattern
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    // Check for existing request ID in headers
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Store request ID on request object for later use
    req.id = requestId;

    // For Fastify, we need to check if it's a Fastify reply or Express response
    if (res.header) {
      // Fastify
      res.header('X-Request-ID', requestId);
    } else if (res.setHeader) {
      // Express fallback
      res.setHeader('X-Request-ID', requestId);
    }

    next();
  }
}
