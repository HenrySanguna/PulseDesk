/**
 * Ticket domain contracts shared between `apps/api` (NestJS, backed by
 * Prisma) and `apps/agent-console` (Angular).
 *
 * `scope:web` cannot depend on `@pulsedesk/db` (`type:data`) per the
 * `@nx/enforce-module-boundaries` rule in the root `eslint.config.mjs`, so
 * these interfaces mirror the wire shape of `apps/api/src/tickets` DTOs and
 * entities (see `TicketsService`, `CreateTicketDto`, `ListTicketsQueryDto`,
 * `UpdateTicketStatusDto`, `CreateMessageDto`) instead of importing the
 * Prisma-generated types directly. Dates travel as ISO strings over HTTP.
 */

export enum TicketStatus {
  NEW = 'NEW',
  OPEN = 'OPEN',
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

// Declaration order matches `apps/api`'s Prisma `enum TicketPriority` —
// Postgres/Prisma order by declaration order, not alphabetically, and the
// queue relies on that for `ORDER BY priority DESC`.
export enum TicketPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum MessageVisibility {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
}

export interface Ticket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  customerId: string;
  assigneeId: string | null;
  slaPolicyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  ticketId: string;
  authorAgentId: string | null;
  visibility: MessageVisibility;
  body: string;
  clientMessageId: string | null;
  createdAt: string;
}

/** Shape of `GET /tickets/:id` — matches `TicketsService.getTicketForAgent`. */
export interface TicketWithMessages extends Ticket {
  messages: Message[];
}

/** Shape of `GET /tickets` — matches `TicketsService.ListTicketsResult`. */
export interface ListTicketsResult {
  items: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListTicketsQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  assigneeId?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTicketRequest {
  customerId: string;
  subject: string;
  priority?: TicketPriority;
}

export interface UpdateTicketStatusRequest {
  status: TicketStatus;
}

export interface CreateMessageRequest {
  body: string;
  visibility?: MessageVisibility;
}

/**
 * Client-side mirror of `apps/api/src/tickets/ticket-state-machine.ts`'s
 * `TICKET_TRANSITIONS` adjacency map. `scope:web` cannot import that
 * Nest-only source file, so this copy is maintained by hand and used only to
 * decide which options the agent console's status dropdown offers — it is
 * never trusted as the actual authorization: `PATCH /tickets/:id/status`
 * re-validates every transition server-side regardless of what the UI sent.
 */
const TICKET_STATUS_TRANSITIONS: Readonly<
  Record<TicketStatus, ReadonlySet<TicketStatus>>
> = {
  [TicketStatus.NEW]: new Set([TicketStatus.OPEN]),
  [TicketStatus.OPEN]: new Set([TicketStatus.PENDING, TicketStatus.RESOLVED]),
  [TicketStatus.PENDING]: new Set([TicketStatus.OPEN, TicketStatus.RESOLVED]),
  [TicketStatus.RESOLVED]: new Set([TicketStatus.CLOSED, TicketStatus.OPEN]),
  [TicketStatus.CLOSED]: new Set([TicketStatus.OPEN]),
};

/** Statuses reachable from `current` in a single transition, in declaration
 * order. Returns an empty array for a status with no valid moves (none
 * today, every status can move somewhere). */
export function getValidNextStatuses(current: TicketStatus): TicketStatus[] {
  return Array.from(TICKET_STATUS_TRANSITIONS[current]);
}
