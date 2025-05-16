import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Observable } from 'rxjs';
import { KmsJwtService } from '../services/kms-jwt.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private reflector: Reflector,
    private kmsJwtService: KmsJwtService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // For JWT protected routes, validate with KMS
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromRequest(request);
    
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    return this.validateToken(token, request);
  }

  /**
   * Extract token from request
   */
  private extractTokenFromRequest(request: any): string | null {
    // Check Authorization header
    if (request.headers.authorization) {
      const [type, token] = request.headers.authorization.split(' ');
      if (type === 'Bearer') {
        return token;
      }
    }
    
    // Check cookies for web client
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token;
    }
    
    return null;
  }

  /**
   * Validate token using KmsJwtService
   */
  private async validateToken(token: string, request: any): Promise<boolean> {
    try {
      const payload = await this.kmsJwtService.verifyToken(token);
      
      // Attach user info to request for controllers to use
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      
      return true;
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`);
      throw new UnauthorizedException('Invalid authentication token');
    }
  }
}