import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  PdButton,
  PdColumnTemplateDirective,
  PdInputText,
  PdSelect,
  PdTable,
  PdTag,
} from '@pulsedesk/ui';
import type { PdTablePageEvent, PdTableColumn } from '@pulsedesk/ui';
import type {
  TicketListItem,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/contracts/tickets';
import type { PdTagSeverity } from '@pulsedesk/ui';
import {
  TICKET_PRIORITY_OPTIONS,
  TICKET_PRIORITY_SEVERITY,
  TICKET_STATUS_OPTIONS,
  TICKET_STATUS_SEVERITY,
} from '../../models/ticket-display';
import { TicketListStore } from '../../services/ticket-list.store';

@Component({
  selector: 'pd-ticket-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    PdButton,
    PdColumnTemplateDirective,
    PdInputText,
    PdSelect,
    PdTable,
    PdTag,
  ],
  templateUrl: './ticket-list.html',
  styleUrl: './ticket-list.css',
})
export class TicketList {
  private readonly router = inject(Router);
  protected readonly store = inject(TicketListStore);

  protected readonly statusOptions = TICKET_STATUS_OPTIONS;
  protected readonly priorityOptions = TICKET_PRIORITY_OPTIONS;

  protected readonly draftStatus = signal<TicketStatus | null>(null);
  protected readonly draftPriority = signal<TicketPriority | null>(null);
  protected readonly draftAssigneeId = signal('');

  protected readonly columns: PdTableColumn<TicketListItem>[] = [
    { field: 'subject', header: 'Subject' },
    { field: 'status', header: 'Status', sortable: true },
    { field: 'priority', header: 'Priority', sortable: true },
    { field: 'assigneeId', header: 'Assignee' },
    { field: 'atRisk', header: 'SLA' },
    { field: 'createdAt', header: 'Created', sortable: true },
  ];

  constructor() {
    this.store.loadPage({ page: 1, pageSize: this.store.pageSize() });
  }

  protected applyFilters(): void {
    this.store.setFilters({
      status: this.draftStatus(),
      priority: this.draftPriority(),
      assigneeId: this.draftAssigneeId().trim() || null,
    });
  }

  protected onPage(event: PdTablePageEvent): void {
    const page = Math.floor(event.first / event.rows) + 1;
    this.store.loadPage({ page, pageSize: event.rows });
  }

  protected openTicket(ticket: TicketListItem): void {
    this.router.navigate(['/tickets', ticket.id]);
  }

  /** `pdColumnTemplate`'s `let-ticket` context is untyped (see
   * `PdColumnTemplateDirective`), so these wrap the lookup behind a typed
   * parameter instead of indexing the severity maps directly in the
   * template with an `any`-typed key. */
  protected statusSeverityFor(status: TicketStatus): PdTagSeverity {
    return TICKET_STATUS_SEVERITY[status];
  }

  protected prioritySeverityFor(priority: TicketPriority): PdTagSeverity {
    return TICKET_PRIORITY_SEVERITY[priority];
  }
}
