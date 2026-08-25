/**
 * Standalone worker process. It never binds an HTTP listener — it only
 * exists to run BullMQ consumers via Nest's DI container.
 */

import { parseEnv } from '@pulsedesk/contracts';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // Fail fast before any Nest DI container exists — see
  // libs/contracts/src/lib/env.ts for the rationale.
  parseEnv();

  // createApplicationContext boots the Nest DI container without an
  // HTTP adapter, so no port is ever opened by this process.
  await NestFactory.createApplicationContext(AppModule);
  Logger.log('🚀 Worker is running (no HTTP surface)');
}

bootstrap();
