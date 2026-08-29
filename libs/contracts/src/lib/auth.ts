/**
 * Auth domain contracts shared between `apps/api` (NestJS) and
 * `apps/agent-console` (Angular). Mirrors the wire shape of
 * `apps/api/src/auth/dto/login.dto.ts` and `PublicAgent` (see
 * `libs/contracts/src/lib/tickets.ts` for the rationale on why `scope:web`
 * cannot import `@pulsedesk/db` directly). Dates travel as ISO strings.
 */

export enum AgentRole {
  AGENT = 'AGENT',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN',
}

export enum AgentAvailability {
  ONLINE = 'ONLINE',
  AWAY = 'AWAY',
  OFFLINE = 'OFFLINE',
}

/** Wire shape of `PublicAgent` (`Omit<Agent, 'passwordHash'>`) as returned
 * by `POST /auth/login`. */
export interface PublicAgentDto {
  id: string;
  email: string;
  role: AgentRole;
  availability: AgentAvailability;
  maxCapacity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  agent: PublicAgentDto;
}
