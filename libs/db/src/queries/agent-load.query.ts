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
      ) AS "loadRank"
    FROM "Agent" a
    LEFT JOIN "Ticket" t ON t."assigneeId" = a.id
    WHERE a."isActive" = true
    GROUP BY a.id, a.email, a."maxCapacity"
    ORDER BY "loadRank" ASC
  `;

  return rows.map((row) => ({
    agentId: row.agentId,
    agentEmail: row.agentEmail,
    activeTicketCount: bigIntToNumber(row.activeTicketCount),
    maxCapacity: row.maxCapacity,
    loadRank: bigIntToNumber(row.loadRank),
  }));
}
