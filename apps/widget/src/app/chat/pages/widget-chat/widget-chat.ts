import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PdButton, PdPulseTrace, PdTextarea } from '@pulsedesk/ui';
import { WidgetChatStore } from '../../services/widget-chat.store';

@Component({
  selector: 'pd-widget-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, PdButton, PdPulseTrace, PdTextarea],
  templateUrl: './widget-chat.html',
  styleUrl: './widget-chat.css',
})
export class WidgetChat {
  protected readonly store = inject(WidgetChatStore);

  protected readonly draft = signal('');
  protected readonly canSend = computed(
    () =>
      this.draft().trim().length > 0 &&
      !this.store.sending() &&
      !this.store.initializing(),
  );

  constructor() {
    this.store.init();
  }

  protected onInput(): void {
    this.store.notifyTyping();
  }

  protected send(): void {
    const body = this.draft().trim();
    if (!body) {
      return;
    }
    this.store.sendMessage(body);
    this.draft.set('');
  }
}
