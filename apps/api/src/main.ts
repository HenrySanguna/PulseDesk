/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { parseEnv } from '@pulsedesk/contracts';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app/app.module';
import { NativeWsAdapter } from './realtime/native-ws.adapter';

async function bootstrap() {
  // Fail fast before any Nest DI container exists — see
  // libs/contracts/src/lib/env.ts for the rationale.
  parseEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  // Required for AgentSessionGuard to read the httpOnly `pd_session`
  // cookie and for /auth/login to set it.
  await app.register(fastifyCookie);
  // ws chat channel (05-add-realtime-hybrid, tasks.md 2.1) — no
  // Socket.IO/@nestjs/platform-ws, a hand-rolled adapter over the `ws`
  // package attached to the same underlying HTTP server Fastify listens on.
  app.useWebSocketAdapter(new NativeWsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const globalPrefix = 'api';
  // /health must stay unprefixed — it's the deployment health-check surface
  // (Fly.io, uptime probes) and the observability spec defines it as
  // `GET /health`, not `GET /api/health`.
  app.setGlobalPrefix(globalPrefix, { exclude: ['health'] });
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
