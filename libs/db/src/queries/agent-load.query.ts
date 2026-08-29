import type { PrismaService } from '../lib/prisma.service.js';
import { bigIntToNumber } from './bigint.js';

/** Raw row shape: `COUNT(*)` and `RANK()` both come back as `bigint` from
 * Postgres; `maxCapacity` is `INTEGER` and comes back as `number` as-is. */
interface AgentLoadRawRow {
  agentId: string;
  agentEmail: string;
  activeTicketCount: bigint;
  maxCapacity: number;
  loadRank: bigint;
  lastAssignedAt: Date | null;
}

export interface AgentLoad {
  agentId: string;
  agentEmail: string;
  /** Tickets currently assigned to this agent in `OPEN` or `PENDING`. */
  activeTicketCount: number;
  maxCapacity: number;
  /** 1 = most loaded. Ties share the same rank (`RANK()`, not
   * `ROW_NUMBER()` or `DENSE_RANK()`). */
  loadRank: number;
  /** Set by round-robin auto-assignment (04-add-sla-jobs) every time this
   * agent receives an assignment. `null` if never auto-assigned — used as
   * the round-robin tie-break (see `libs/sla-engine`-adjacent
   * `apps/api/src/sla/round-robin.ts`: least-recently-assigned wins). */
  lastAssignedAt: Date | null;
}

/**
 * Per-agent active ticket load, ranked via a window function — Prisma's
 * typed API has no `RANK() OVER (...)` equivalent, hence `$queryRaw`. See
 * design.md "Consultas de agregación".
 */
export async function getAgentLoad(
  prisma: Pick<PrismaService, '$queryRaw'>,
): Promise<AgentLoad[]> {
  const rows = await prisma.$queryRaw<AgentLoadRawRow[]>`
    SELECT
      a.id AS "agentId",
      a.email AS "agentEmail",
      COUNT(t.id) FILTER (WHERE t.status IN ('OPEN', 'PENDING'))::bigint AS "activeTicketCount",
      a."maxCapacity" AS "maxCapacity",
      RANK() OVER (
        ORDER BY COUNT(t.id) FILTER (WHERE t.status IN ('OPEN', 'PENDING')) DESC
      ) AS "loadRank",
      a."lastAssignedAt" AS "lastAssignedAt"
    FROM "Agent" a
    LEFT JOIN "Ticket" t ON t."assigneeId" = a.id
    WHERE a."isActive" = true
    GROUP BY a.id, a.email, a."maxCapacity", a."lastAssignedAt"
    ORDER BY "loadRank" ASC
  `;

  return rows.map((row) => ({
    agentId: row.agentId,
    agentEmail: row.agentEmail,
    activeTicketCount: bigIntToNumber(row.activeTicketCount),
    maxCapacity: row.maxCapacity,
    loadRank: bigIntToNumber(row.loadRank),
    lastAssignedAt: row.lastAssignedAt,
  }));
}
