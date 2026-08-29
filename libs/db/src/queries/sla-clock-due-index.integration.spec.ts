import { afterAll, describe, expect, it } from 'vitest';
import { createRealPrismaService } from './test-real-prisma.js';

/**
 * "Definición de terminado" proof (04-add-sla-jobs tasks.md 1.4): the
 * partial index on `SlaClock.dueAt` exists in the real database after
 * migrations, scoped to still-active clocks only — verified against
 * Postgres's own catalog (`pg_indexes`), not by inspecting the migration
 * file. Same pattern as
 * `libs/db/src/queries/ticket-queue-index.integration.spec.ts`.
 */
describe('sla_clocks_due_idx (real Postgres catalog)', () => {
  const prisma = createRealPrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exists on SlaClock, scoped to running (not paused, not completed) clocks, ordered by dueAt', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'SlaClock' AND indexname = 'sla_clocks_due_idx'
    `;

    expect(rows).toHaveLength(1);
    const [{ indexdef }] = rows;
    expect(indexdef).toContain('"completedAt" IS NULL');
    expect(indexdef).toContain('"pausedAt" IS NULL');
    expect(indexdef).toContain('"dueAt"');
  });
});
