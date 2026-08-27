import { describe, expect, it, vi } from 'vitest';
import type { PublicAgent } from '@pulsedesk/db';
import { AgentsController } from './agents.controller.js';
import type { AuthService } from './auth.service.js';

const DEACTIVATED_AGENT: PublicAgent = {
  id: 'agent-1',
  email: 'agent@pulsedesk.test',
  role: 'AGENT',
  availability: 'OFFLINE',
  maxCapacity: 5,
  isActive: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AgentsController.deactivate', () => {
  it('delegates to AuthService.deactivateAgent and returns the resulting PublicAgent', async () => {
    const authService = {
      deactivateAgent: vi.fn(() => Promise.resolve(DEACTIVATED_AGENT)),
    } as unknown as AuthService;
    const controller = new AgentsController(authService);

    const response = await controller.deactivate(DEACTIVATED_AGENT.id);

    expect(authService.deactivateAgent).toHaveBeenCalledWith(
      DEACTIVATED_AGENT.id,
    );
    expect(response).toEqual({ agent: DEACTIVATED_AGENT });
    expect(response.agent).not.toHaveProperty('passwordHash');
  });
});
