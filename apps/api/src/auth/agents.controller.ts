import {
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AgentRole, type PublicAgent } from '@pulsedesk/db';
import { AgentSessionGuard } from './agent-session.guard.js';
import { AuthService } from './auth.service.js';
import { Roles } from './decorators/roles.decorator.js';
import { RoleGuard } from './role.guard.js';

@Controller('auth/agents')
export class AgentsController {
  constructor(private readonly authService: AuthService) {}

  /** Admin-only. Deactivates the agent AND revokes every one of their
   * active sessions immediately (not just future logins) — see
   * `AuthService.deactivateAgent`. */
  @UseGuards(AgentSessionGuard, RoleGuard)
  @Roles(AgentRole.ADMIN)
  @Patch(':id/deactivate')
  async deactivate(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ agent: PublicAgent }> {
    const agent = await this.authService.deactivateAgent(id);
    return { agent };
  }
}
