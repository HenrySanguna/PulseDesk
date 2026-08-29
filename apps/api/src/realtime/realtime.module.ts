import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaService } from '@pulsedesk/db';
import { AuthModule } from '../auth/auth.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { WIDGET_TOKEN_TTL } from '../widget/widget.constants.js';
import { ConversationGateway } from './conversation.gateway.js';
import { ConversationRoomsService } from './conversation-rooms.service.js';
import { realtimeConnectionProviders } from './realtime-connections.providers.js';
import { RealtimeController } from './realtime.controller.js';
import { RealtimeEventBusService } from './realtime-event-bus.service.js';
import { RealtimeSseService } from './realtime-sse.service.js';
import { WidgetMessagingService } from './widget-messaging.service.js';

/**
 * Everything 05-add-realtime-hybrid adds: the SSE dashboard bus (section 1
 * + 3) and the `ws` chat gateway (section 2 + 4's send path).
 *
 * `@Global()`: `RealtimeEventBusService` needs to be injectable from
 * `TicketsService` (dashboard events on ticket create/status/claim) and
 * `SlaClockService` (dashboard event on SLA breach — the exact "worker
 * generates an event, api forwards it to SSE clients" scenario spec
 * requires), but `RealtimeModule` itself needs `TicketsModule` (for
 * `TicketsService`/the new `WidgetMessagingService`, used by the `ws`
 * message-send path). `TicketsModule -> RealtimeModule -> TicketsModule`
 * would be a literal module-import cycle; `@Global()` breaks it —
 * `TicketsModule`/`SlaModule` never need `RealtimeModule` in their own
 * `imports`, they just `@Optional() @Inject(RealtimeEventBusService)` it
 * directly (see `realtime-event.ts`'s `RealtimeEventBusPort` doc comment for
 * why that injection is optional, not required).
 */
@Global()
@Module({
  imports: [
    AuthModule,
    TicketsModule,
    // Verifies (never signs) widget conversation tokens — same secret/TTL
    // config as `WidgetModule`'s own `JwtModule.register`, duplicated here
    // rather than importing `WidgetModule` directly: `WidgetModule` only
    // exports `WidgetTokenGuard` (an HTTP `CanActivate`, not usable for a
    // raw `ws` Upgrade handshake), and `TicketsModule` already imports
    // `WidgetModule` — importing it a second time here would add nothing
    // this `JwtModule.register` doesn't already provide.
    JwtModule.register({
      secret: process.env['WIDGET_JWT_SECRET'],
      signOptions: { expiresIn: WIDGET_TOKEN_TTL },
    }),
  ],
  controllers: [RealtimeController],
  providers: [
    PrismaService,
    ...realtimeConnectionProviders,
    RealtimeEventBusService,
    RealtimeSseService,
    ConversationRoomsService,
    WidgetMessagingService,
    ConversationGateway,
  ],
  exports: [RealtimeEventBusService],
})
export class RealtimeModule {}
