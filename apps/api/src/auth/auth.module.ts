import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaService, valkeyProvider } from '@pulsedesk/db';
import { AgentSessionGuard } from './agent-session.guard.js';
import { AgentsController } from './agents.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { RoleGuard } from './role.guard.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [
    // Login attempts: rate limited per-IP to slow credential stuffing.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController, AgentsController],
  providers: [
    PrismaService,
    valkeyProvider,
    AuthService,
    PasswordService,
    SessionsService,
    AgentSessionGuard,
    RoleGuard,
  ],
  exports: [AgentSessionGuard, RoleGuard],
})
export class AuthModule {}
