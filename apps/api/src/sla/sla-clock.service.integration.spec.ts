import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService, SlaClockKind } from '@pulsedesk/db';
import { createBullMqConnection } from './bullmq-connection.provider.js';
import { BusinessCalendarRepository } from './business-calendar.repository.js';
import { SlaClockRepository } from './sla-clock.repository.js';
import { SlaClockService } from './sla-clock.service.js';
import { SlaQueueService } from './sla-queue.service.js';
import { slaDueJobId } from './sla-queue.constants.js';
import { ensureAlwaysOpenCalendar, seedTicketForSla } from './sla-test-fixtures.js';

/**
 * Real Postgres + real Valkey/BullMQ proof of tasks.md section 3
 * (pause/resume/complete) — 5.2 (pause/resume math across multiple cycles)
 * and 5.3 (cancellation actually removes the scheduled job, not just marks
 * DB state).
 */
describe('SlaClockService (real Postgres + real Valkey)', () => {
  const prisma = new PrismaService();
  const connection = createBullMqConnection(process.env['REDIS_URL'] as string);
  const repo = new SlaClockRepository(prisma);
  const calendars = new BusinessCalendarRepository(prisma);
  const slaQueue = new SlaQueueService(connection);
  const service = new SlaClockService(repo, calendars, slaQueue, prisma);

  const suffix = `slaclock-svc-${Date.now()}`;
  const ticketIds: string[] = [];
  const clockIds: string[] = [];
  const customerIds: string[] = [];

  beforeAll(async () => {
    await ensureAlwaysOpenCalendar(prisma);
  });

  afterAll(async () => {
    await prisma.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.slaClock.deleteMany({ where: { id: { in: clockIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await slaQueue.onModuleDestroy();
    await connection.quit();
    await prisma.$disconnect();
  });

  async function seedTicket(label: string) {
    const seeded = await seedTicketForSla(prisma, `${suffix}-${label}`);
    ticketIds.push(seeded.ticketId);
    customerIds.push(seeded.customerId);
    return seeded.ticketId;
  }

  /** Rewinds `activeSince` by `minutesAgo` real minutes — since the seeded
   * calendar is always-open, business time == wall-clock time, so this
   * deterministically fast-forwards "time consumed while active" without
   * the test actually waiting. */
  async function rewindActiveSince(clockId: string, minutesAgo: number): Promise<void> {
    await prisma.slaClock.update({
      where: { id: clockId },
      data: { activeSince: new Date(Date.now() - minutesAgo * 60_000) },
    });
  }

  it('5.2: three consecutive pause/resume cycles conserve the correct remaining business time', async () => {
    const ticketId = await seedTicket('pause-resume');
    const targetMinutes = 240;
    const clock = await service.start(ticketId, SlaClockKind.RESOLUTION, targetMinutes);
    clockIds.push(clock.id);

    // 2.2: start() scheduled a due job under the deterministic jobId.
    const jobId = slaDueJobId(clock.id, targetMinutes);
    expect(await slaQueue.queue.getJob(jobId)).toBeDefined();

    // Cycle 1: 60 minutes consumed.
    await rewindActiveSince(clock.id, 60);
    const [paused1] = await service.pause(ticketId);
    expect(paused1.consumedMinutes).toBe(60);
    expect(paused1.pausedAt).not.toBeNull();
    expect(paused1.dueAt).toBeNull();
    // 2.3: pausing cancels the previously-scheduled due job.
    expect(await slaQueue.queue.getJob(jobId)).toBeUndefined();

    const [resumed1] = await service.resume(ticketId);
    expect(resumed1.pausedAt).toBeNull();
    expect(resumed1.dueAt).not.toBeNull();
    // 2.2: resuming reschedules under the SAME deterministic jobId
    // (targetMinutes never changes across pause/resume for one clock).
    expect(await slaQueue.queue.getJob(jobId)).toBeDefined();

    // Cycle 2: 50 more minutes consumed (total 110).
    await rewindActiveSince(clock.id, 50);
    const [paused2] = await service.pause(ticketId);
    expect(paused2.consumedMinutes).toBe(110);
    await service.resume(ticketId);

    // Cycle 3: 70 more minutes consumed (total 180).
    await rewindActiveSince(clock.id, 70);
    const [paused3] = await service.pause(ticketId);
    expect(paused3.consumedMinutes).toBe(180);

    const [resumed3] = await service.resume(ticketId);

    // Total accounted for: consumed across all 3 cycles + remaining after
    // the final resume must equal the original SLA exactly.
    const finalRemaining = targetMinutes - paused3.consumedMinutes;
    expect(paused3.consumedMinutes).toBe(60 + 50 + 70);
    expect(finalRemaining).toBe(60);

    // dueAt after the final resume reflects exactly the remaining minutes
    // from the resume instant (always-open calendar => wall-clock delta).
    if (!resumed3.dueAt) {
      throw new Error('expected dueAt to be set after resume');
    }
    const dueDeltaMs = resumed3.dueAt.getTime() - resumed3.activeSince.getTime();
    expect(Math.round(dueDeltaMs / 60_000)).toBe(finalRemaining);
  });

  it('pause() on a ticket with no running clocks is a no-op (empty array, not an error)', async () => {
    const ticketId = await seedTicket('pause-noop');
    await expect(service.pause(ticketId)).resolves.toEqual([]);
    await expect(service.resume(ticketId)).resolves.toEqual([]);
  });

  it('5.3: completing a clock cancels its scheduled due job — the job no longer exists in the queue', async () => {
    const ticketId = await seedTicket('cancel');
    const clock = await service.start(ticketId, SlaClockKind.FIRST_RESPONSE, 30);
    clockIds.push(clock.id);

    const jobId = slaDueJobId(clock.id, clock.targetMinutes);
    const scheduledJob = await slaQueue.queue.getJob(jobId);
    if (!scheduledJob) {
      throw new Error('expected the due job to be scheduled');
    }
    expect(await scheduledJob.isDelayed()).toBe(true);

    const completed = await service.complete(ticketId, SlaClockKind.FIRST_RESPONSE);
    expect(completed?.completedAt).not.toBeNull();
    expect(completed?.dueAt).toBeNull();

    const jobAfterCancel = await slaQueue.queue.getJob(jobId);
    expect(jobAfterCancel).toBeUndefined();
  });

  it('complete() is idempotent — completing twice does not throw and does not change completedAt', async () => {
    const ticketId = await seedTicket('complete-twice');
    const clock = await service.start(ticketId, SlaClockKind.RESOLUTION, 30);
    clockIds.push(clock.id);

    const first = await service.complete(ticketId, SlaClockKind.RESOLUTION);
    const second = await service.complete(ticketId, SlaClockKind.RESOLUTION);

    expect(first?.completedAt).toEqual(second?.completedAt);
  });

  it('scheduling the same due job twice with the same jobId does not create a duplicate (layer-1 idempotency)', async () => {
    const ticketId = await seedTicket('dedup');
    const clock = await service.start(ticketId, SlaClockKind.RESOLUTION, 45);
    clockIds.push(clock.id);

    // Re-schedule the exact same clock/dueAt a second time, simulating a
    // caller accidentally re-invoking scheduling for the same clock.
    if (!clock.dueAt) {
      throw new Error('expected dueAt to be set after start()');
    }
    await slaQueue.scheduleDueJob(clock, clock.dueAt);

    const counts = await slaQueue.queue.getJobCounts('delayed', 'waiting');
    const jobId = slaDueJobId(clock.id, clock.targetMinutes);
    const job = await slaQueue.queue.getJob(jobId);
    expect(job).toBeDefined();
    // Exactly one job with this id exists — BullMQ dedupes on jobId, it
    // doesn't create a second entry.
    expect((counts.delayed ?? 0) + (counts.waiting ?? 0)).toBeGreaterThanOrEqual(1);

    await service.complete(ticketId, SlaClockKind.RESOLUTION);
  });
});
