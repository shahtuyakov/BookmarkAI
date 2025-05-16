import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from route metadata
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are required, allow access
    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // Ensure user exists and has a role
    if (!user || !user.role) {
      this.logger.warn('User missing or has no role');
      throw new ForbiddenException('Insufficient permissions');
    }
    
    // Check if user has required role
    const hasRole = requiredRoles.includes(user.role);
    
    if (!hasRole) {
      this.logger.warn(`User ${user.id} with role ${user.role} tried to access route requiring roles: ${requiredRoles.join(', ')}`);
      throw new ForbiddenException('Insufficient permissions');
    }
    
    return true;
  }
}