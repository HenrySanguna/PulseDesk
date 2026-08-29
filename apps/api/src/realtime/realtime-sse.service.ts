import { Inject, Injectable } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RealtimeEventBusService } from './realtime-event-bus.service.js';
import type { RealtimeEvent } from './realtime-event.js';
import { SSE_HEARTBEAT_INTERVAL_MS } from './realtime-event.js';

function toMessageEvent(event: RealtimeEvent): MessageEvent {
  return { id: String(event.id), type: event.type, data: event.payload };
}

/**
 * Builds the SSE `Observable` the `@Sse()` controller handler returns
 * (tasks.md 1.1/1.2/1.3). Kept separate from `RealtimeController` so the
 * gap-free resume logic below is unit-testable without a real HTTP request.
 *
 * Gap-free reconnect (spec "Reanudación de flujo SSE sin pérdida de
 * eventos"): a client that only fetched the resume buffer AFTER subscribing
 * to the live stream could still miss an event published in between (a
 * genuine race, not a hypothetical one — Valkey PUBLISH and this service's
 * buffer LRANGE are two separate round trips). This subscribes to the live
 * stream FIRST, buffering incoming events locally while the backlog read is
 * in flight, then flushes backlog-then-buffered-live in id order with a
 * `lastEmittedId` dedupe guard so an event present in both never emits
 * twice.
 */
@Injectable()
export class RealtimeSseService {
  constructor(@Inject(RealtimeEventBusService) private readonly bus: RealtimeEventBusService) {}

  streamDashboard(sinceId: number): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let lastEmittedId = sinceId;
      let backlogFlushed = false;
      const pendingLive: RealtimeEvent[] = [];

      const emit = (event: RealtimeEvent): void => {
        if (event.id <= lastEmittedId) {
          return;
        }
        lastEmittedId = event.id;
        subscriber.next(toMessageEvent(event));
      };

      const liveSubscription = this.bus.stream().subscribe((event) => {
        if (backlogFlushed) {
          emit(event);
        } else {
          pendingLive.push(event);
        }
      });

      this.bus
        .getEventsSince(sinceId)
        .then((backlog) => {
          for (const event of backlog) {
            emit(event);
          }
          for (const event of pendingLive) {
            emit(event);
          }
          backlogFlushed = true;
        })
        .catch((err: unknown) => subscriber.error(err));

      const heartbeat = setInterval(() => {
        subscriber.next({ comment: 'heartbeat' });
      }, SSE_HEARTBEAT_INTERVAL_MS);

      return () => {
        liveSubscription.unsubscribe();
        clearInterval(heartbeat);
      };
    });
  }
}
