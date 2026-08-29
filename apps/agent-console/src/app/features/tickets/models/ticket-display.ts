import type { PdSelectOption, PdTagSeverity } from '@pulsedesk/ui';
import {
  MessageVisibility,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/contracts/tickets';

/** Presentation-only mapping from domain enums to {@link PdTagSeverity} —
 * deliberately kept in the feature, not in `libs/ui`, since `libs/ui` stays
 * generic and has no knowledge of the ticket domain. */
export const TICKET_STATUS_SEVERITY: Record<TicketStatus, PdTagSeverity> = {
  [TicketStatus.NEW]: 'info',
  [TicketStatus.OPEN]: 'warn',
  [TicketStatus.PENDING]: 'secondary',
  [TicketStatus.RESOLVED]: 'success',
  [TicketStatus.CLOSED]: 'contrast',
};

export const TICKET_PRIORITY_SEVERITY: Record<TicketPriority, PdTagSeverity> =
  {
    [TicketPriority.LOW]: 'secondary',
    [TicketPriority.NORMAL]: 'info',
    [TicketPriority.HIGH]: 'warn',
    [TicketPriority.URGENT]: 'danger',
  };

export const MESSAGE_VISIBILITY_SEVERITY: Record<
  MessageVisibility,
  PdTagSeverity
> = {
  [MessageVisibility.PUBLIC]: 'success',
  [MessageVisibility.INTERNAL]: 'warn',
};

export const TICKET_STATUS_OPTIONS: PdSelectOption<TicketStatus>[] =
  Object.values(TicketStatus).map((status) => ({
    label: status,
    value: status,
  }));

export const TICKET_PRIORITY_OPTIONS: PdSelectOption<TicketPriority>[] =
  Object.values(TicketPriority).map((priority) => ({
    label: priority,
    value: priority,
  }));

export const MESSAGE_VISIBILITY_OPTIONS: PdSelectOption<MessageVisibility>[] =
  Object.values(MessageVisibility).map((visibility) => ({
    label: visibility,
    value: visibility,
  }));
