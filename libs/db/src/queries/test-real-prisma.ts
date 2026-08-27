import 'dotenv/config';
import { PrismaService } from '../lib/prisma.service.js';

/** Real `PrismaService` connected to the docker-compose Postgres (or CI's
 * service container) via `DATABASE_URL`. Only for integration tests in
 * this directory that need a genuine Postgres round-trip — never
 * re-exported from `index.ts`, so it never ships as part of this
 * library's public surface. */
export function createRealPrismaService(): PrismaService {
  return new PrismaService();
}
