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
  // SessionsService must be exported too, not just AgentSessionGuard: a
  // consuming module (e.g. TicketsModule) referencing AgentSessionGuard
  // via `@UseGuards(AgentSessionGuard)` resolves it through its OWN
  // module injector, which needs every one of the guard's constructor
  // dependencies to be independently reachable, not just the guard class
  // itself.
  exports: [AgentSessionGuard, RoleGuard, SessionsService],
})
export class AuthModule {}
