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
import type { CannedResponse } from '@pulsedesk/contracts/canned-responses';
import {
  applyShortcutTrigger,
  matchShortcutTrigger,
} from '@pulsedesk/contracts/canned-responses';
import {
  MESSAGE_VISIBILITY_OPTIONS,
  MESSAGE_VISIBILITY_SEVERITY,
  TICKET_PRIORITY_SEVERITY,
  TICKET_STATUS_SEVERITY,
} from '../../models/ticket-display';
import { AuthStore } from '../../../auth/services/auth.store';
import { CannedResponsesStore } from '../../services/canned-responses.store';
import { ConversationStore } from '../../services/conversation.store';
import { TicketDetailStore } from '../../services/ticket-detail.store';

/** Suggestions shown at once (tasks.md 1.2) — enough to be useful, short
 * enough to stay fully keyboard-reachable without scrolling. */
const MAX_SHORTCUT_SUGGESTIONS = 5;

@Component({
  selector: 'pd-ticket-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PdButton, PdSelect, PdTag, PdTextarea],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.css',
})
export class TicketDetail {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthStore);
  protected readonly store = inject(TicketDetailStore);
  protected readonly conversation = inject(ConversationStore);
  protected readonly cannedResponses = inject(CannedResponsesStore);

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

  /** The `/shortcut` fragment currently being typed at the end of the reply
   * (tasks.md 1.2), or `null` when there is none to autocomplete. */
  protected readonly shortcutFragment = computed(() =>
    matchShortcutTrigger(this.replyBody()),
  );
  protected readonly shortcutSuggestions = computed<CannedResponse[]>(() => {
    const fragment = this.shortcutFragment();
    if (fragment === null) {
      return [];
    }
    return this.cannedResponses
      .items()
      .filter((response) =>
        response.shortcut.toLowerCase().startsWith(fragment.toLowerCase()),
      )
      .slice(0, MAX_SHORTCUT_SUGGESTIONS);
  });

  /** Agents other than the one currently signed in who also have this
   * ticket open right now (tasks.md 3.1/3.2 "también viendo esto"). */
  protected readonly otherAgentsViewing = computed(() => {
    const selfId = this.auth.agent()?.id;
    return this.conversation
      .ticketPresentAgentIds()
      .filter((agentId) => agentId !== selfId);
  });

  constructor() {
    this.cannedResponses.ensureLoaded();
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
    // Ticket-level presence (tasks.md 3.1/3.2) — unlike the chat join
    // above, this ALWAYS joins, for every ticket, whether or not it has a
    // linked widget conversation.
    effect(() => {
      const ticketId = this.id();
      this.conversation.joinTicketPresence(ticketId);
    });
    inject(DestroyRef).onDestroy(() => {
      this.conversation.leave();
      this.conversation.leaveTicketPresence();
    });
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

  /** Replaces the trailing `/shortcut` fragment with the chosen response's
   * full body (tasks.md 1.2) — see `applyShortcutTrigger`'s doc comment. */
  protected applyShortcutSuggestion(response: CannedResponse): void {
    this.replyBody.set(applyShortcutTrigger(this.replyBody(), response.body));
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
