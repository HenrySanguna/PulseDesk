import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { WidgetTokenGuard } from './widget-token.guard.js';
import type { WidgetAuthenticatedRequest } from './widget-token.types.js';

const JWT_SECRET = 'test-widget-jwt-secret-not-for-production-use';

function makeContext(request: Partial<WidgetAuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request as WidgetAuthenticatedRequest,
    }),
  } as unknown as ExecutionContext;
}

describe('WidgetTokenGuard', () => {
  const jwt = new JwtService({ secret: JWT_SECRET });
  const guard = new WidgetTokenGuard(jwt);

  it('rejects a request with no Authorization header', async () => {
    const context = makeContext({ headers: {}, params: {} });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a malformed/forged token', async () => {
    const context = makeContext({
      headers: { authorization: 'Bearer not-a-real-jwt' },
      params: {},
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a different secret', async () => {
    const otherJwt = new JwtService({ secret: 'a-completely-different-secret' });
    const forgedToken = await otherJwt.signAsync({
      conversationId: 'conversation-A',
      customerId: 'customer-1',
    });
    const context = makeContext({
      headers: { authorization: `Bearer ${forgedToken}` },
      params: { conversationId: 'conversation-A' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a token used on its own conversation', async () => {
    const token = await jwt.signAsync({
      conversationId: 'conversation-A',
      customerId: 'customer-1',
    });
    const request: Partial<WidgetAuthenticatedRequest> = {
      headers: { authorization: `Bearer ${token}` },
      params: { conversationId: 'conversation-A' },
    };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.widgetToken).toMatchObject({
      conversationId: 'conversation-A',
      customerId: 'customer-1',
    });
  });

  it('5.2: rejects a token for conversation A when used on conversation B, even for the same customer', async () => {
    const tokenForConversationA = await jwt.signAsync({
      conversationId: 'conversation-A',
      customerId: 'customer-1',
    });
    const context = makeContext({
      headers: { authorization: `Bearer ${tokenForConversationA}` },
      params: { conversationId: 'conversation-B' },
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
