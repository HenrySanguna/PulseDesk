import type { AgentLoad } from '@pulsedesk/db';

/**
 * Round-robin candidate selection (design.md "Auto-asignación
 * round-robin"): among agents with capacity headroom, picks the one with
 * the lowest load RELATIVE to capacity (`activeTicketCount / maxCapacity`),
 * tie-broken by longest time since last auto-assignment (never-assigned —
 * `lastAssignedAt === null` — always wins a tie). A pure function so the
 * capacity/tie-break rules (tasks.md 5.6/5.7) are unit-testable without a
 * database.
 *
 * An agent already AT `maxCapacity` is excluded entirely (spec: "Auto-
 * asignación respeta la capacidad del agente") — not just deprioritized.
 * Returns `null` when no agent has any capacity left.
 */
export function pickAssignmentCandidate(agents: readonly AgentLoad[]): string | null {
  const eligible = agents.filter((agent) => agent.activeTicketCount < agent.maxCapacity);
  if (eligible.length === 0) {
    return null;
  }

  const sorted = [...eligible].sort((a, b) => {
    const loadRatioA = a.activeTicketCount / a.maxCapacity;
    const loadRatioB = b.activeTicketCount / b.maxCapacity;
    if (loadRatioA !== loadRatioB) {
      return loadRatioA - loadRatioB;
    }
    const lastAssignedAtA = a.lastAssignedAt?.getTime() ?? -Infinity;
    const lastAssignedAtB = b.lastAssignedAt?.getTime() ?? -Infinity;
    return lastAssignedAtA - lastAssignedAtB;
  });

  return sorted[0].agentId;
}
