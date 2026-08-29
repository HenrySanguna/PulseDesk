import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '@pulsedesk/db';
import { TicketStatus } from '@pulsedesk/db';
import type { AssignmentQueuePort } from '../sla/assignment-queue.service.js';
import { TicketsService } from './tickets.service.js';

function makeAssignmentQueue(): AssignmentQueuePort {
  return { enqueueAutoAssign: vi.fn().mockResolvedValue(undefined) };
}

function makePrisma(): PrismaService {
  const prisma: Record<string, unknown> = {
    ticket: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    ticketEvent: {
      create: vi.fn(),
    },
  };
  prisma['$transaction'] = vi.fn((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma as unknown as PrismaService;
}

describe('TicketsService (mocked Prisma)', () => {
  it('listTickets builds a WHERE clause only from the filters actually provided, and paginates', async () => {
    const prisma = makePrisma();
    const service = new TicketsService(prisma, makeAssignmentQueue());

    await service.listTickets({ status: TicketStatus.OPEN, page: 2, pageSize: 10 });

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: TicketStatus.OPEN },
        skip: 10,
        take: 10,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      }),
    );
  });

  it('claimTicket throws ConflictException when the atomic updateMany matches zero rows', async () => {
    const prisma = makePrisma();
    (prisma.ticket.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });
    const service = new TicketsService(prisma, makeAssignmentQueue());

    await expect(
      service.claimTicket('ticket-1', 'agent-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.ticket.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('claimTicket re-reads the ticket and logs an ASSIGNED event when updateMany matches one row', async () => {
    const prisma = makePrisma();
    (prisma.ticket.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 1,
    });
    (
      prisma.ticket.findUniqueOrThrow as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ id: 'ticket-1', status: TicketStatus.OPEN });
    const service = new TicketsService(prisma, makeAssignmentQueue());

    const ticket = await service.claimTicket('ticket-1', 'agent-1');

    expect(ticket).toEqual({ id: 'ticket-1', status: TicketStatus.OPEN });
    expect(prisma.ticketEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: 'ticket-1',
          type: 'ASSIGNED',
          actorAgentId: 'agent-1',
        }),
      }),
    );
  });
});
