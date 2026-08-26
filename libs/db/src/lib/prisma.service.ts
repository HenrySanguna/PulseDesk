import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/client.js';

/**
 * Thin Nest wrapper around the generated Prisma client, shared by
 * `apps/api` and `apps/worker` (both `scope:shared` consumers per the
 * boundary rules).
 *
 * Deliberately does NOT `$connect()` in `onModuleInit`: Prisma connects
 * lazily on the first query, so a temporarily unreachable Postgres never
 * prevents the Nest application from bootstrapping. Connectivity failures
 * are surfaced by callers (e.g. `/health`) instead of crashing the process.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
