import type { ChartData } from 'chart.js';
import type { AgentLoad, DashboardSnapshot } from '@pulsedesk/contracts/realtime';

/**
 * Pure Chart.js data builders (tasks.md 2.1) — kept framework-free so they
 * are unit-testable without Angular's `TestBed`, same pattern
 * `libs/ui/src/lib/table/sort-rows.ts` uses.
 */

const STATUS_LABELS = ['New', 'Open', 'Pending', 'Resolved', 'Closed'] as const;
const STATUS_COLORS = ['#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#94a3b8'];

export function buildStatusBreakdownChartData(
  snapshot: DashboardSnapshot,
): ChartData {
  return {
    labels: [...STATUS_LABELS],
    datasets: [
      {
        data: [
          snapshot.newCount,
          snapshot.openCount,
          snapshot.pendingCount,
          snapshot.resolvedCount,
          snapshot.closedCount,
        ],
        backgroundColor: STATUS_COLORS,
      },
    ],
  };
}

export function buildAgentLoadChartData(rows: AgentLoad[]): ChartData {
  return {
    labels: rows.map((row) => row.agentEmail),
    datasets: [
      {
        label: 'Active tickets',
        data: rows.map((row) => row.activeTicketCount),
        backgroundColor: '#60a5fa',
      },
      {
        label: 'Capacity',
        data: rows.map((row) => row.maxCapacity),
        backgroundColor: '#e2e8f0',
      },
    ],
  };
}
