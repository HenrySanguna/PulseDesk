import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HealthModule } from '../health/health.module.js';
import { WidgetModule } from '../widget/widget.module.js';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [HealthModule, AuthModule, WidgetModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
