import { afterAll, describe, expect, it } from 'vitest';
import { getAgentLoad } from './agent-load.query.js';
import { getDashboardSnapshot } from './dashboard-snapshot.query.js';
import { createRealPrismaService } from './test-real-prisma.js';

/**
 * Shape tests for the `$queryRaw` aggregations — proves the REAL column
 * names/types Postgres returns match the hand-declared return interfaces
 * (`DashboardSnapshot`, `AgentLoad`), per openspec/project.md: "Toda
 * consulta con $queryRaw tiene un test de integración que verifica que la
 * forma declarada coincide con el resultado real de Postgres." Runs
 * against the real docker-compose Postgres, not a mock — in particular
 * this is what actually proves the bigint→number mapping in
 * `bigIntToNumber` runs, since a mocked Prisma client would just return
 * whatever type the mock author typed by hand.
 */
describe('raw aggregation queries (real Postgres)', () => {
  const prisma = createRealPrismaService();
  const suffix = `agg-${Date.now()}`;
  const customerId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const ticketIds: string[] = [];

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
    await prisma.agent.deleteMany({ where: { id: agentId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('getDashboardSnapshot returns the declared shape with real bigint→number conversion', async () => {
    await prisma.customer.create({
      data: { id: customerId, sessionId: `session-${suffix}` },
    });
    await prisma.agent.create({
      data: {
        id: agentId,
        email: `agent-${suffix}@pulsedesk.test`,
        passwordHash: 'irrelevant-for-this-test',
      },
    });
    const ticket = await prisma.ticket.create({
      data: {
        subject: 'Shape test ticket',
        customerId,
        assigneeId: agentId,
        status: 'OPEN',
      },
    });
    ticketIds.push(ticket.id);
    await prisma.message.create({
      data: { ticketId: ticket.id, body: 'first reply', authorAgentId: agentId },
    });

    const snapshot = await getDashboardSnapshot(prisma);

    expect(typeof snapshot.totalTickets).toBe('number');
    expect(typeof snapshot.newCount).toBe('number');
    expect(typeof snapshot.openCount).toBe('number');
    expect(typeof snapshot.pendingCount).toBe('number');
    expect(typeof snapshot.resolvedCount).toBe('number');
    expect(typeof snapshot.closedCount).toBe('number');
    expect(typeof snapshot.atRiskCount).toBe('number');
    expect(snapshot.totalTickets).toBeGreaterThanOrEqual(1);
    expect(snapshot.openCount).toBeGreaterThanOrEqual(1);
    expect(
      snapshot.firstResponseP50Minutes === null ||
        typeof snapshot.firstResponseP50Minutes === 'number',
    ).toBe(true);
    expect(
      snapshot.firstResponseP90Minutes === null ||
        typeof snapshot.firstResponseP90Minutes === 'number',
    ).toBe(true);
  });

  it('getAgentLoad returns the declared shape with real bigint→number conversion', async () => {
    const load = await getAgentLoad(prisma);
    const row = load.find((entry) => entry.agentId === agentId);

    expect(row).toBeDefined();
    expect(typeof row?.agentId).toBe('string');
    expect(typeof row?.agentEmail).toBe('string');
    expect(typeof row?.activeTicketCount).toBe('number');
    expect(typeof row?.maxCapacity).toBe('number');
    expect(typeof row?.loadRank).toBe('number');
    expect(row?.activeTicketCount).toBeGreaterThanOrEqual(1);
  });
});
