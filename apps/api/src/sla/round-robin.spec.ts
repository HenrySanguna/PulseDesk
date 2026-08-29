import { describe, expect, it } from 'vitest';
import type { AgentLoad } from '@pulsedesk/db';
import { pickAssignmentCandidate } from './round-robin.js';

function agent(overrides: Partial<AgentLoad> & { agentId: string }): AgentLoad {
  return {
    agentEmail: `${overrides.agentId}@pulsedesk.test`,
    activeTicketCount: 0,
    maxCapacity: 5,
    loadRank: 1,
    lastAssignedAt: null,
    ...overrides,
  };
}

describe('pickAssignmentCandidate', () => {
  it('returns null when there are no agents at all', () => {
    expect(pickAssignmentCandidate([])).toBeNull();
  });

  it('5.6: excludes an agent already at maxCapacity, even if it would otherwise be picked', () => {
    const atCapacity = agent({ agentId: 'at-capacity', activeTicketCount: 3, maxCapacity: 3 });
    const withRoom = agent({ agentId: 'with-room', activeTicketCount: 4, maxCapacity: 10 });

    expect(pickAssignmentCandidate([atCapacity, withRoom])).toBe('with-room');
  });

  it('5.6: returns null when every agent is at (or over) capacity', () => {
    const atCapacity = agent({ agentId: 'at-capacity', activeTicketCount: 5, maxCapacity: 5 });
    const overCapacity = agent({ agentId: 'over-capacity', activeTicketCount: 6, maxCapacity: 5 });

    expect(pickAssignmentCandidate([atCapacity, overCapacity])).toBeNull();
  });

  it('picks the agent with the lowest load RELATIVE to capacity, not the lowest absolute count', () => {
    // 3/10 = 0.3 vs 1/2 = 0.5 — fewer tickets absolute, but relatively busier.
    const busierRelatively = agent({ agentId: 'busier', activeTicketCount: 1, maxCapacity: 2 });
    const freerRelatively = agent({ agentId: 'freer', activeTicketCount: 3, maxCapacity: 10 });

    expect(pickAssignmentCandidate([busierRelatively, freerRelatively])).toBe('freer');
  });

  it('5.7: tie-break by longest time since last assignment when load ratios are equal', () => {
    const recentlyAssigned = agent({
      agentId: 'recent',
      activeTicketCount: 1,
      maxCapacity: 5,
      lastAssignedAt: new Date(Date.now() - 5 * 60_000),
    });
    const longAgo = agent({
      agentId: 'long-ago',
      activeTicketCount: 1,
      maxCapacity: 5,
      lastAssignedAt: new Date(Date.now() - 30 * 60_000),
    });

    expect(pickAssignmentCandidate([recentlyAssigned, longAgo])).toBe('long-ago');
  });

  it('5.7: never-assigned (null lastAssignedAt) wins a tie over any real timestamp, however old', () => {
    const assignedOnceLongAgo = agent({
      agentId: 'assigned-once',
      activeTicketCount: 0,
      maxCapacity: 5,
      lastAssignedAt: new Date('2000-01-01T00:00:00Z'),
    });
    const neverAssigned = agent({
      agentId: 'never-assigned',
      activeTicketCount: 0,
      maxCapacity: 5,
      lastAssignedAt: null,
    });

    expect(pickAssignmentCandidate([assignedOnceLongAgo, neverAssigned])).toBe('never-assigned');
  });
});
