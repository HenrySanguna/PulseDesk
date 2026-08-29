import type { IncomingMessage } from 'node:http';
import type { JwtService } from '@nestjs/jwt';
import { AGENT_PUBLIC_SELECT, PrismaService } from '@pulsedesk/db';
import { SESSION_COOKIE_NAME } from '../auth/auth.constants.js';
import type { SessionsService } from '../auth/sessions.service.js';
import type { WidgetTokenPayload } from '../widget/widget-token.types.js';

/** Authenticated identity of a `ws` connection, established once during the
 * `Upgrade` handshake (tasks.md 2.2) and attached to the socket for the
 * rest of its lifetime — see `ConversationGateway.handleConnection`. */
export type WsAuthContext =
  | { kind: 'agent'; agentId: string }
  | { kind: 'widget'; conversationId: string; customerId: string };

/** Minimal cookie-header parser — the raw `Upgrade` request is a plain Node
 * `IncomingMessage`, not a Fastify request, so `@fastify/cookie`'s
 * request-decoration (`request.cookies`) isn't available here. Only needs
 * to extract one known cookie name, not a general-purpose parser. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) {
      cookies[name] = decodeURIComponent(value);
    }
  }
  return cookies;
}

/** Widget token travels as a `?token=` query param (design.md "Autenticación
 * en el handshake": "el token de widget se pasa como query param... ya que
 * un cliente de widget no tiene cookie de agente"). `EventSource`-style
 * custom-header limitations don't apply to `ws` (it CAN set headers before
 * v13 same-origin browser restrictions... but a browser `WebSocket` client
 * cannot set arbitrary headers either — only cookies and the URL are
 * available — so the query param is the only viable channel here too). */
function extractQueryToken(request: IncomingMessage): string | null {
  const url = new URL(request.url ?? '', 'http://ws.internal');
  return url.searchParams.get('token');
}

export interface WsAuthDeps {
  sessions: Pick<SessionsService, 'resolveAgentId'>;
  prisma: Pick<PrismaService, 'agent'>;
  jwt: Pick<JwtService, 'verifyAsync'>;
}

/**
 * Resolves the identity behind a `ws` `Upgrade` request (tasks.md 2.2):
 * a widget token (query param, verified the same way `WidgetTokenGuard`
 * does) or an agent session cookie (verified the same way
 * `AgentSessionGuard` does — re-fetched from Postgres so a deactivated
 * agent's session table row is still resolvable but a lookup of the CURRENT
 * agent). Returns `null` for a handshake that fails both, which the caller
 * closes the connection for.
 */
export async function authenticateWsHandshake(
  request: IncomingMessage,
  deps: WsAuthDeps,
): Promise<WsAuthContext | null> {
  const token = extractQueryToken(request);
  if (token) {
    try {
      const payload = await deps.jwt.verifyAsync<WidgetTokenPayload>(token);
      return {
        kind: 'widget',
        conversationId: payload.conversationId,
        customerId: payload.customerId,
      };
    } catch {
      return null;
    }
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const rawSessionToken = cookies[SESSION_COOKIE_NAME];
  if (!rawSessionToken) {
    return null;
  }
  const agentId = await deps.sessions.resolveAgentId(rawSessionToken);
  if (!agentId) {
    return null;
  }
  const agent = await deps.prisma.agent.findUnique({
    where: { id: agentId },
    select: AGENT_PUBLIC_SELECT,
  });
  if (!agent || !agent.isActive) {
    return null;
  }
  return { kind: 'agent', agentId };
}
