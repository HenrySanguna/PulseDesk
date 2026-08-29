import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SlaClockKind } from '@pulsedesk/db';
import { SlaClockConflictException } from './sla-clock-conflict.exception.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { seedTicketForSla } from './sla-test-fixtures.js';

/**
 * Real-Postgres proof of the manual optimistic-lock guard (design.md
 * "Bloqueo optimista manual", tasks.md 5.4) — the exact scenario design.md
 * describes: two processes touching the same clock concurrently (e.g. an
 * agent's manual pause and the worker's own due-job breach) must resolve
 * to exactly one winner, with the loser's failure NOT corrupting state.
 */
describe('SlaClockRepository (real Postgres) — version conflict', () => {
  const prisma = new PrismaService();
  const repo = new SlaClockRepository(prisma);
  const suffix = `slaclock-repo-${Date.now()}`;
  let ticketId: string;
  let customerId: string;
  const clockIds: string[] = [];

  beforeAll(async () => {
    const seeded = await seedTicketForSla(prisma, suffix);
    ticketId = seeded.ticketId;
    customerId = seeded.customerId;
  });

  afterAll(async () => {
    await prisma.ticketEvent.deleteMany({ where: { ticketId } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('5.4: two concurrent updates to the same clock — exactly one succeeds, the other gets SlaClockConflictException, state is not corrupted', async () => {
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.RESOLUTION,
        targetMinutes: 60,
        dueAt: new Date(Date.now() + 60 * 60_000),
        activeSince: new Date(),
      },
    });
    clockIds.push(clock.id);

    const results = await Promise.allSettled([
      repo.update(clock.id, clock.version, { pausedAt: new Date() }),
      repo.update(clock.id, clock.version, { completedAt: new Date() }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      SlaClockConflictException,
    );

    const persisted = await prisma.slaClock.findUniqueOrThrow({ where: { id: clock.id } });
    // Version incremented exactly once (the winner's write), not twice.
    expect(persisted.version).toBe(clock.version + 1);
    // Exactly one of the two competing fields landed — never both, never
    // neither (that would mean the guard let a write through without
    // actually matching the expected version, or silently dropped one).
    const pausedWon = persisted.pausedAt !== null;
    const completedWon = persisted.completedAt !== null;
    expect(pausedWon).not.toBe(completedWon);

    const winner = fulfilled[0] as PromiseFulfilledResult<
      Awaited<ReturnType<typeof repo.update>>
    >;
    expect(winner.value.version).toBe(clock.version + 1);
  });

  it('a caller retrying with the fresh version after a conflict succeeds', async () => {
    const clock = await prisma.slaClock.create({
      data: {
        ticketId,
        kind: SlaClockKind.FIRST_RESPONSE,
        targetMinutes: 30,
        dueAt: new Date(Date.now() + 30 * 60_000),
        activeSince: new Date(),
      },
    });
    clockIds.push(clock.id);

    // Simulate a concurrent writer that already won.
    await repo.update(clock.id, clock.version, { consumedMinutes: 5 });

    // The original caller still holds the STALE version.
    await expect(
      repo.update(clock.id, clock.version, { consumedMinutes: 10 }),
    ).rejects.toBeInstanceOf(SlaClockConflictException);

    // Retrying after re-reading the fresh version succeeds.
    const fresh = await repo.findByIdOrThrow(clock.id);
    const retried = await repo.update(fresh.id, fresh.version, { consumedMinutes: 10 });
    expect(retried.consumedMinutes).toBe(10);
  });
});
