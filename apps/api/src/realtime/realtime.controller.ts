import { Controller, Get, Headers, Inject, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { AgentLoad, DashboardSnapshot } from '@pulsedesk/db';
import { getAgentLoad, getDashboardSnapshot, PrismaService } from '@pulsedesk/db';
import type { Observable } from 'rxjs';
import { AgentSessionGuard } from '../auth/agent-session.guard.js';
import { RealtimeSseService } from './realtime-sse.service.js';

/** Parses the `Last-Event-ID` header `EventSource` automatically resends on
 * reconnect. Missing/malformed -> `0`, which `getEventsSince` treats as
 * "everything currently buffered" (every real id is >= 1, `INCR` starts at
 * 1) — a first-time connection, not a resume, gets no backlog replay either
 * way since the buffer only holds events from before it ever connected. */
function parseLastEventId(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** SSE controller (tasks.md 1.1): unidirectional dashboard push, guarded the
 * same way every other agent-only route is (`AgentSessionGuard`) — see
 * design.md "Limitación aceptada" for why this MUST be cookie auth, not a
 * `Authorization` header: `EventSource` cannot set custom headers. */
@Controller('realtime')
export class RealtimeController {
  constructor(
    @Inject(RealtimeSseService) private readonly sse: RealtimeSseService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @UseGuards(AgentSessionGuard)
  @Get('dashboard/snapshot')
  getSnapshot(): Promise<DashboardSnapshot> {
    return getDashboardSnapshot(this.prisma);
  }

  /** Feeds the agent-load chart (06-add-polish tasks.md 2.1) — `getAgentLoad`
   * (03-add-ticket-queue) existed but, like `getDashboardSnapshot` before
   * 05-add-realtime-hybrid wired it, was never reachable over HTTP until
   * now. Plain REST, not SSE: per-agent load changes far less often than
   * the dashboard's ticket counts, and `DashboardStore` already refetches
   * it on every `dashboard.snapshot` push, which is a close enough proxy
   * for "something ticket/assignment-related just changed". */
  @UseGuards(AgentSessionGuard)
  @Get('dashboard/agent-load')
  getAgentLoadSnapshot(): Promise<AgentLoad[]> {
    return getAgentLoad(this.prisma);
  }

  @UseGuards(AgentSessionGuard)
  @Sse('dashboard')
  dashboard(@Headers('last-event-id') lastEventId?: string): Observable<MessageEvent> {
    return this.sse.streamDashboard(parseLastEventId(lastEventId));
  }
}
