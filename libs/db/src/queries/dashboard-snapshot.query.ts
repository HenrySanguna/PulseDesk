import type { PrismaService } from '../lib/prisma.service.js';
import { bigIntToNumber } from './bigint.js';

/**
 * Raw row shape as Postgres/`pg` actually returns it: `COUNT(*)` columns
 * come back as `bigint`, `PERCENTILE_CONT` comes back as `number` (Postgres
 * `double precision`). Kept separate from {@link DashboardSnapshot} (the
 * public, JSON-serializable shape) on purpose — see `bigIntToNumber`.
 */
interface DashboardSnapshotRawRow {
  totalTickets: bigint;
  newCount: bigint;
  openCount: bigint;
  pendingCount: bigint;
  resolvedCount: bigint;
  closedCount: bigint;
  firstResponseP50Minutes: number | null;
  firstResponseP90Minutes: number | null;
  atRiskCount: bigint;
}

export interface DashboardSnapshot {
  totalTickets: number;
  newCount: number;
  openCount: number;
  pendingCount: number;
  resolvedCount: number;
  closedCount: number;
  /** Median minutes between ticket creation and the first agent-authored
   * message. `null` when no ticket has an agent reply yet. */
  firstResponseP50Minutes: number | null;
  /** 90th-percentile minutes between ticket creation and the first
   * agent-authored message. `null` when no ticket has an agent reply yet. */
  firstResponseP90Minutes: number | null;
  /** Tickets still open (`NEW`/`OPEN`/`PENDING`) that have already burned
   * 80% of their SLA policy's resolution window. `SlaClock` isn't running
   * yet (Phase 4), so this is computed on the fly from `createdAt` +
   * `SlaPolicy.resolutionMinutes` rather than read off a live due date. */
  atRiskCount: number;
}

/**
 * Counts by status, first-response latency percentiles, and at-risk ticket
 * counts — none of which Prisma's typed query API can express (percentiles
 * and `FILTER`-based conditional counts have no typed equivalent), hence
 * `$queryRaw`. See design.md "Consultas de agregación".
 */
export async function getDashboardSnapshot(
  prisma: Pick<PrismaService, '$queryRaw'>,
): Promise<DashboardSnapshot> {
  const rows = await prisma.$queryRaw<DashboardSnapshotRawRow[]>`
    SELECT
      COUNT(*)::bigint AS "totalTickets",
      COUNT(*) FILTER (WHERE t.status = 'NEW')::bigint AS "newCount",
      COUNT(*) FILTER (WHERE t.status = 'OPEN')::bigint AS "openCount",
      COUNT(*) FILTER (WHERE t.status = 'PENDING')::bigint AS "pendingCount",
      COUNT(*) FILTER (WHERE t.status = 'RESOLVED')::bigint AS "resolvedCount",
      COUNT(*) FILTER (WHERE t.status = 'CLOSED')::bigint AS "closedCount",
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (fr."firstResponseAt" - t."createdAt")) / 60
      ) AS "firstResponseP50Minutes",
      PERCENTILE_CONT(0.9) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (fr."firstResponseAt" - t."createdAt")) / 60
      ) AS "firstResponseP90Minutes",
      COUNT(*) FILTER (
        WHERE t.status IN ('NEW', 'OPEN', 'PENDING')
          AND sp."resolutionMinutes" IS NOT NULL
          AND t."createdAt" + (sp."resolutionMinutes" * INTERVAL '1 minute') * 0.8 < NOW()
      )::bigint AS "atRiskCount"
    FROM "Ticket" t
    LEFT JOIN "SlaPolicy" sp ON sp.id = t."slaPolicyId"
    LEFT JOIN LATERAL (
      SELECT MIN(m."createdAt") AS "firstResponseAt"
      FROM "Message" m
      WHERE m."ticketId" = t.id AND m."authorAgentId" IS NOT NULL
    ) fr ON true
  `;

  const row = rows[0];
  return {
    totalTickets: bigIntToNumber(row?.totalTickets),
    newCount: bigIntToNumber(row?.newCount),
    openCount: bigIntToNumber(row?.openCount),
    pendingCount: bigIntToNumber(row?.pendingCount),
    resolvedCount: bigIntToNumber(row?.resolvedCount),
    closedCount: bigIntToNumber(row?.closedCount),
    firstResponseP50Minutes: row?.firstResponseP50Minutes ?? null,
    firstResponseP90Minutes: row?.firstResponseP90Minutes ?? null,
    atRiskCount: bigIntToNumber(row?.atRiskCount),
  };
}
