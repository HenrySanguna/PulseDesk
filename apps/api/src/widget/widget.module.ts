import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService } from '@pulsedesk/db';
import { WidgetTokenGuard } from './widget-token.guard.js';
import { WidgetController } from './widget.controller.js';
import { WidgetService } from './widget.service.js';
import { WIDGET_TOKEN_TTL } from './widget.constants.js';

@Module({
  imports: [
    // Conversation creation: rate limited per-IP to slow down abuse.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
    JwtModule.register({
      secret: process.env['WIDGET_JWT_SECRET'],
      signOptions: { expiresIn: WIDGET_TOKEN_TTL },
    }),
  ],
  controllers: [WidgetController],
  providers: [PrismaService, WidgetService, WidgetTokenGuard],
  // TicketsModule reuses WidgetTokenGuard for the customer-facing half of
  // `GET /tickets/:id` (see TicketRequesterGuard).
  exports: [WidgetTokenGuard],
})
export class WidgetModule {}
