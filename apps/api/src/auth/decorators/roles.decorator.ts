import { SetMetadata } from '@nestjs/common';
import { AgentRole } from '@pulsedesk/db';

export const ROLES_KEY = 'roles';

/** Declares which `AgentRole`s may access a route. Read by `RoleGuard`,
 * which MUST run after `AgentSessionGuard` in the same `@UseGuards(...)`
 * call so `request.agent` is already populated. */
export const Roles = (
  ...roles: AgentRole[]
): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, roles);
