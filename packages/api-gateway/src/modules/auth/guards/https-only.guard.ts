import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';

/**
 * Guard to ensure endpoints are only accessible via HTTPS in production
 */
@Injectable()
export class HttpsOnlyGuard implements CanActivate {
  private readonly enforceHttps: boolean;

  constructor(private readonly configService: ConfigService) {
    // Only enforce HTTPS in production
    const environment = this.configService.get<string>('NODE_ENV', 'development');
    this.enforceHttps = environment === 'production';
  }

  canActivate(context: ExecutionContext): boolean {
    // Skip check if not in production
    if (!this.enforceHttps) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    
    // Check if request is HTTPS
    // Support common proxy headers
    const isHttps = 
      request.secure || 
      request.headers['x-forwarded-proto'] === 'https' ||
      request.protocol === 'https';

    if (!isHttps) {
      throw new ForbiddenException('HTTPS required for this endpoint');
    }

    return true;
  }
}