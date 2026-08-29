import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Observable } from 'rxjs';
import { Subject } from 'rxjs';
import { getDashboardSnapshot, PrismaService } from '@pulsedesk/db';
import {
  DASHBOARD_BUFFER_KEY,
  DASHBOARD_BUFFER_MAX_EVENTS,
  DASHBOARD_CHANNEL,
  DASHBOARD_EVENT_TYPE,
  DASHBOARD_SEQ_KEY,
  type RealtimeEvent,
  type RealtimeEventBusPort,
} from './realtime-event.js';
import {
  REALTIME_CONNECTION,
  REALTIME_SUBSCRIBER_CONNECTION,
} from './realtime-connections.providers.js';

/**
 * The realtime event bus (tasks.md section 3): publish side (append to the
 * resume buffer, then `PUBLISH` to Valkey) and live side (one dedicated
 * subscriber connection, fanned out in-process to every local SSE connection
 * via `live$`). See `openspec/changes/05-add-realtime-hybrid/tasks.md`
 * "Nota de arquitectura" for why the "worker" and "api" sides of this bus
 * are two classes/connections co-located in one process rather than two
 * separate deployables — same reasoning as 04-add-sla-jobs's `SlaModule`.
 *
 * `@Global()` on `RealtimeModule` (see realtime.module.ts) makes this
 * injectable anywhere without that module needing to be imported back by
 * `TicketsModule`/`SlaModule` — avoids a module-import cycle (RealtimeModule
 * already imports TicketsModule for the `ws` chat channel's
 * `WidgetMessagingService`).
 */
@Injectable()
export class RealtimeEventBusService
  implements OnModuleInit, OnModuleDestroy, RealtimeEventBusPort
{
  private readonly logger = new Logger(RealtimeEventBusService.name);
  private readonly live$ = new Subject<RealtimeEvent>();

  constructor(
    @Inject(REALTIME_CONNECTION) private readonly connection: Redis,
    @Inject(REALTIME_SUBSCRIBER_CONNECTION) private readonly subscriber: Redis,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.subscriber.subscribe(DASHBOARD_CHANNEL);
    this.subscriber.on('message', (channel: string, message: string) => {
      if (channel !== DASHBOARD_CHANNEL) {
        return;
      }
      try {
        this.live$.next(JSON.parse(message) as RealtimeEvent);
      } catch (err) {
        this.logger.warn(`Dropped malformed realtime event: ${(err as Error).message}`);
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.unsubscribe(DASHBOARD_CHANNEL);
    this.live$.complete();
  }

  /** Live stream of events published by ANY `apps/api` instance (including
   * this one) — the `ws`-equivalent of `ConversationRoomsService.broadcast`,
   * but process-wide via Valkey instead of an in-process `Map`. */
  stream(): Observable<RealtimeEvent> {
    return this.live$.asObservable();
  }

  /** Appends `event` to the bounded resume buffer (tasks.md 1.3) and
   * publishes it to every subscribed `apps/api` instance (tasks.md 3.1/3.2).
   * Buffer write happens BEFORE publish so a client that reads the buffer
   * right after receiving the live event never sees a shorter buffer than
   * what it was just notified about. */
  async publish<TPayload>(type: string, payload: TPayload): Promise<RealtimeEvent<TPayload>> {
    const id = await this.connection.incr(DASHBOARD_SEQ_KEY);
    const event: RealtimeEvent<TPayload> = { id, type, payload, ts: Date.now() };
    await this.connection.lpush(DASHBOARD_BUFFER_KEY, JSON.stringify(event));
    await this.connection.ltrim(DASHBOARD_BUFFER_KEY, 0, DASHBOARD_BUFFER_MAX_EVENTS - 1);
    await this.connection.publish(DASHBOARD_CHANNEL, JSON.stringify(event));
    return event;
  }

  /** Recomputes the full dashboard aggregate (same query `03-add-ticket-queue`
   * added but never wired to a route — see `libs/db/src/queries/dashboard-snapshot.query.ts`)
   * and publishes it as one `dashboard.snapshot` event. Called after any
   * mutation that changes dashboard-visible state: ticket create/claim/status
   * change (`TicketsService`) and SLA breach (`SlaClockService.breach()`) —
   * the latter is what proves spec's "Propagación de eventos generados por
   * el worker" (a breach recorded by the SLA consumer must reach a connected
   * SSE client) without a real separate `apps/worker` process, per this
   * change's architecture note. */
  async publishDashboardSnapshot(): Promise<void> {
    const snapshot = await getDashboardSnapshot(this.prisma);
    await this.publish(DASHBOARD_EVENT_TYPE, snapshot);
  }

  /** Every buffered event with `id > sinceId`, oldest first — used to
   * replay events missed during a brief SSE disconnect (tasks.md 1.3,
   * spec "Reanudación de flujo SSE sin pérdida de eventos"). Returns an
   * empty array (not an error) if the buffer has already rotated past
   * `sinceId` — a client that was disconnected longer than the buffer
   * window simply resumes from "now" instead, same as any bounded replay
   * log. */
  async getEventsSince(sinceId: number): Promise<RealtimeEvent[]> {
    const raw = await this.connection.lrange(DASHBOARD_BUFFER_KEY, 0, DASHBOARD_BUFFER_MAX_EVENTS - 1);
    return raw
      .map((entry) => JSON.parse(entry) as RealtimeEvent)
      .filter((event) => event.id > sinceId)
      .sort((a, b) => a.id - b.id);
  }
}
