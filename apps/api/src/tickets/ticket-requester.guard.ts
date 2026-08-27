import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AgentSessionGuard } from '../auth/agent-session.guard.js';
import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import { WidgetTokenGuard } from '../widget/widget-token.guard.js';
import type { TicketAuthenticatedRequest } from './ticket-request.js';

/**
 * Authenticates either an agent session cookie OR a widget bearer token —
 * `GET /tickets/:id` is the one route in this module both actor kinds can
 * reach (agents see the full thread, customers see only their own ticket
 * with public messages only; see `TicketsService`). Branches on which
 * credential is PRESENT rather than try/catch-falling-through, so a
 * genuinely expired agent session still reports as an agent-auth failure
 * instead of a confusing widget-token error.
 */
@Injectable()
export class TicketRequesterGuard implements CanActivate {
  constructor(
    private readonly agentSessionGuard: AgentSessionGuard,
    private readonly widgetTokenGuard: WidgetTokenGuard,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> | boolean {
    const request = context
      .switchToHttp()
      .getRequest<TicketAuthenticatedRequest>();

    if (request.cookies?.[SESSION_COOKIE_NAME]) {
      return this.agentSessionGuard.canActivate(context);
    }

    if (request.headers.authorization?.startsWith('Bearer ')) {
      return this.widgetTokenGuard.canActivate(context);
    }

    throw new UnauthorizedException(
      'No agent session or widget token provided',
    );
  }
}
