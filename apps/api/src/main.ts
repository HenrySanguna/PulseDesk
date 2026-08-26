/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { parseEnv } from '@pulsedesk/contracts';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // Fail fast before any Nest DI container exists — see
  // libs/contracts/src/lib/env.ts for the rationale.
  parseEnv();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
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
