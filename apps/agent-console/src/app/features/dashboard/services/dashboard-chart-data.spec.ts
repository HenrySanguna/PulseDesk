import type { AgentLoad, DashboardSnapshot } from '@pulsedesk/contracts/realtime';
import {
  buildAgentLoadChartData,
  buildStatusBreakdownChartData,
} from './dashboard-chart-data';

const SNAPSHOT: DashboardSnapshot = {
  totalTickets: 10,
  newCount: 2,
  openCount: 3,
  pendingCount: 1,
  resolvedCount: 3,
  closedCount: 1,
  firstResponseP50Minutes: 5,
  firstResponseP90Minutes: 20,
  atRiskCount: 1,
};

describe('buildStatusBreakdownChartData', () => {
  it('maps each status count to its own dataset slice, in a fixed order', () => {
    const chart = buildStatusBreakdownChartData(SNAPSHOT);
    expect(chart.labels).toEqual(['New', 'Open', 'Pending', 'Resolved', 'Closed']);
    expect(chart.datasets[0].data).toEqual([2, 3, 1, 3, 1]);
  });
});

describe('buildAgentLoadChartData', () => {
  const rows: AgentLoad[] = [
    {
      agentId: 'a1',
      agentEmail: 'a1@pulsedesk.test',
      activeTicketCount: 3,
      maxCapacity: 5,
      loadRank: 1,
      lastAssignedAt: null,
    },
    {
      agentId: 'a2',
      agentEmail: 'a2@pulsedesk.test',
      activeTicketCount: 1,
      maxCapacity: 5,
      loadRank: 2,
      lastAssignedAt: null,
    },
  ];

  it('labels each bar by agent email and carries both active/capacity datasets', () => {
    const chart = buildAgentLoadChartData(rows);
    expect(chart.labels).toEqual(['a1@pulsedesk.test', 'a2@pulsedesk.test']);
    expect(chart.datasets).toHaveLength(2);
    expect(chart.datasets[0].data).toEqual([3, 1]);
    expect(chart.datasets[1].data).toEqual([5, 5]);
  });

  it('returns empty labels/data for an empty agent list', () => {
    const chart = buildAgentLoadChartData([]);
    expect(chart.labels).toEqual([]);
    expect(chart.datasets[0].data).toEqual([]);
  });
});
