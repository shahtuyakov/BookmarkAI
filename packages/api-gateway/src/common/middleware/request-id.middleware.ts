import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to ensure all requests have a unique request ID
 * Follows the X-Request-ID header pattern
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: FastifyRequest, res: FastifyReply, next: () => void) {
    // Check for existing request ID in headers
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();

    // Store request ID on request object for later use
    (req as { id?: string }).id = requestId;

    // Set response header
    res.header('X-Request-ID', requestId);

    next();
  }
}
