import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { PdButton, PdSelect, PdTag, PdTextarea } from '@pulsedesk/ui';
import type { PdSelectOption } from '@pulsedesk/ui';
import {
  MessageVisibility,
  TicketStatus,
  getValidNextStatuses,
} from '@pulsedesk/contracts/tickets';
import {
  MESSAGE_VISIBILITY_OPTIONS,
  MESSAGE_VISIBILITY_SEVERITY,
  TICKET_PRIORITY_SEVERITY,
  TICKET_STATUS_SEVERITY,
} from '../../models/ticket-display';
import { ConversationStore } from '../../services/conversation.store';
import { TicketDetailStore } from '../../services/ticket-detail.store';

@Component({
  selector: 'pd-ticket-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PdButton, PdSelect, PdTag, PdTextarea],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.css',
})
export class TicketDetail {
  private readonly router = inject(Router);
  protected readonly store = inject(TicketDetailStore);
  protected readonly conversation = inject(ConversationStore);

  // Bound automatically from the `:id` route param — see
  // `withComponentInputBinding()` in app.config.ts.
  readonly id = input.required<string>();

  protected readonly statusSeverity = TICKET_STATUS_SEVERITY;
  protected readonly prioritySeverity = TICKET_PRIORITY_SEVERITY;
  protected readonly visibilitySeverity = MESSAGE_VISIBILITY_SEVERITY;
  protected readonly visibilityOptions = MESSAGE_VISIBILITY_OPTIONS;

  /** Only the transitions `apps/api/src/tickets/ticket-state-machine.ts`
   * actually allows from the ticket's current status — see
   * `getValidNextStatuses` in `@pulsedesk/contracts`. */
  protected readonly nextStatusOptions = computed<
    PdSelectOption<TicketStatus>[]
  >(() => {
    const ticket = this.store.ticket();
    if (!ticket) {
      return [];
    }
    return getValidNextStatuses(ticket.status).map((status) => ({
      label: status,
      value: status,
    }));
  });

  protected readonly replyBody = signal('');
  protected readonly replyVisibility = signal<MessageVisibility>(
    MessageVisibility.PUBLIC,
  );
  protected readonly canSend = computed(
    () => this.replyBody().trim().length > 0 && !this.store.sendingMessage(),
  );

  constructor() {
    effect(() => {
      this.store.load(this.id());
    });
    // Live delivery (tasks.md 2.6, Definición de terminado): joins this
    // ticket's `ws` room once its linked widget conversation is known —
    // most agent-created tickets have none (`conversationId: null`), which
    // is a normal, silent no-op here.
    effect(() => {
      const conversationId = this.store.ticket()?.conversationId;
      if (conversationId) {
        this.conversation.join(conversationId);
      }
    });
    inject(DestroyRef).onDestroy(() => this.conversation.leave());
  }

  protected backToQueue(): void {
    this.router.navigate(['/tickets']);
  }

  protected claim(): void {
    this.store.claim();
  }

  protected changeStatus(status: TicketStatus | null): void {
    if (status) {
      this.store.updateStatus(status);
    }
  }

  protected onVisibilityChange(value: MessageVisibility | null): void {
    if (value) {
      this.replyVisibility.set(value);
    }
  }

  protected send(): void {
    const body = this.replyBody().trim();
    if (!body) {
      return;
    }
    this.store.sendMessage(body, this.replyVisibility());
    this.replyBody.set('');
  }
}
