import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HealthModule } from '../health/health.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { SlaModule } from '../sla/sla.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { WidgetModule } from '../widget/widget.module.js';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    HealthModule,
    AuthModule,
    WidgetModule,
    SlaModule,
    TicketsModule,
    // @Global() — see realtime/realtime.module.ts's doc comment for why it
    // must be imported here (once) rather than by TicketsModule/SlaModule.
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
