import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  WidgetAuthenticatedRequest,
  WidgetTokenPayload,
} from './widget-token.types.js';

const BEARER_PREFIX = 'Bearer ';

/**
 * Verifies the widget conversation JWT on every use — signature AND
 * expiry AND that the token's `conversationId` claim matches the
 * `:conversationId` route param being accessed. A token issued for
 * conversation A must be rejected on conversation B's resources, even
 * though both may belong to the same customer.
 */
@Injectable()
export class WidgetTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<WidgetAuthenticatedRequest>();

    const authHeader = request.headers.authorization;
    const rawToken = authHeader?.startsWith(BEARER_PREFIX)
      ? authHeader.slice(BEARER_PREFIX.length)
      : undefined;

    if (!rawToken) {
      throw new UnauthorizedException('Missing widget token');
    }

    let payload: WidgetTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<WidgetTokenPayload>(rawToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired widget token');
    }

    const params = request.params as Record<string, string> | undefined;
    const requestedConversationId = params?.['conversationId'];
    if (
      requestedConversationId &&
      payload.conversationId !== requestedConversationId
    ) {
      throw new ForbiddenException(
        'Widget token is not scoped to this conversation',
      );
    }

    request.widgetToken = payload;
    return true;
  }
}
