import { afterAll, describe, expect, it } from 'vitest';
import { createRealPrismaService } from './test-real-prisma.js';

/**
 * "Definición de terminado" proof (tasks.md): the partial index on the
 * unassigned queue exists in the real database after migrations —
 * verified against Postgres's own catalog (`pg_indexes`), not by
 * inspecting the migration file.
 */
describe('Ticket_unassigned_queue_idx (real Postgres catalog)', () => {
  const prisma = createRealPrismaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('exists on Ticket, scoped to unassigned NEW tickets, ordered by priority desc / createdAt asc', async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'Ticket' AND indexname = 'Ticket_unassigned_queue_idx'
    `;

    expect(rows).toHaveLength(1);
    const [{ indexdef }] = rows;
    expect(indexdef).toContain('"assigneeId" IS NULL');
    expect(indexdef).toContain(`status = 'NEW'::"TicketStatus"`);
    expect(indexdef).toContain('priority DESC');
  });
});
