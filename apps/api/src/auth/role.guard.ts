import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AgentRole } from '@pulsedesk/db';
import { ROLES_KEY } from './decorators/roles.decorator.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

/**
 * Authorizes by `AgentRole` (agent/supervisor/admin). Composable with, and
 * MUST run after, `AgentSessionGuard` in the same `@UseGuards(...)` array —
 * it reads `request.agent`, which only `AgentSessionGuard` populates.
 */
@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<
      AgentRole[] | undefined
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.agent) {
      throw new ForbiddenException(
        'RoleGuard used on a route without AgentSessionGuard',
      );
    }

    return requiredRoles.includes(request.agent.role);
  }
}
