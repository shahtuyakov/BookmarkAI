import { SetMetadata } from '@nestjs/common';

// Define allowed roles for a route
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);