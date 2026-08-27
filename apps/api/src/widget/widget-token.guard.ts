import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { WIDGET_CUSTOMER_SCOPED_KEY } from './widget-customer-scoped.decorator.js';
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
 *
 * A route with no `:conversationId` param to check against fails
 * closed unless explicitly marked `@WidgetCustomerScoped()` — this
 * makes "authorize by customerId only" an intentional, reviewed
 * per-route decision instead of something a future route could
 * silently inherit just by omitting the param.
 */
@Injectable()
export class WidgetTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

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
    if (requestedConversationId) {
      if (payload.conversationId !== requestedConversationId) {
        throw new ForbiddenException(
          'Widget token is not scoped to this conversation',
        );
      }
    } else {
      const isCustomerScoped = this.reflector.getAllAndOverride<boolean>(
        WIDGET_CUSTOMER_SCOPED_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!isCustomerScoped) {
        throw new ForbiddenException(
          'Route has no :conversationId to scope this widget token to, and is not marked @WidgetCustomerScoped()',
        );
      }
    }

    request.widgetToken = payload;
    return true;
  }
}
