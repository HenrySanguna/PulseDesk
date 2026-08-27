import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { PublicAgent } from '@pulsedesk/db';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/public.decorator.js';
import { AgentSessionGuard } from './agent-session.guard.js';
import { AGENT_SESSION_TTL_SEC, SESSION_COOKIE_NAME } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { CurrentAgent } from './decorators/current-agent.decorator.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** No `AgentSessionGuard` here by design — there is no session yet. Rate
   * limited per-IP to slow down credential-stuffing/brute-force attempts. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ agent: PublicAgent }> {
    const { agent, sessionToken } = await this.authService.login(
      dto.email,
      dto.password,
    );

    reply.setCookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: AGENT_SESSION_TTL_SEC,
    });

    return { agent };
  }

  @UseGuards(AgentSessionGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @CurrentAgent() agent: PublicAgent,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ success: true }> {
    if (request.sessionToken) {
      await this.authService.logout(agent.id, request.sessionToken);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { success: true };
  }
}
