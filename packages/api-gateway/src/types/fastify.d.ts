import { RateLimitInfo } from '../common/interceptors/rate-limit.interceptor';

declare module 'fastify' {
  interface FastifyRequest {
    rateLimit?: RateLimitInfo;
    user?: {
      id: string;
      subscription?: {
        tier?: string;
      };
      [key: string]: unknown;
    };
    routerPath?: string;
  }
}
