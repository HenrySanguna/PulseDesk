import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Button } from 'primeng/button';

/** Mirrors PrimeNG's `ButtonSeverity` union without importing PrimeNG's
 * internal type path. */
export type PdButtonSeverity =
  | 'success'
  | 'info'
  | 'warn'
  | 'danger'
  | 'help'
  | 'primary'
  | 'secondary'
  | 'contrast';

/**
 * Wraps PrimeNG's `p-button` and applies the frequent-action press feedback
 * (`scale(0.97)` on `:active`, 150ms ease-out) required for buttons the
 * agent clicks many times per session (claim, status change, filters).
 */
@Component({
  selector: 'pd-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <p-button
      [label]="label()"
      [severity]="severity()"
      [outlined]="outlined()"
      [disabled]="disabled()"
      [loading]="loading()"
      [icon]="icon()"
      styleClass="transition-transform duration-150 ease-out active:scale-[0.97]"
      (onClick)="clicked.emit($event)"
    />
  `,
})
export class PdButton {
  readonly label = input('');
  readonly severity = input<PdButtonSeverity>();
  readonly outlined = input(false);
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly icon = input('');
  readonly clicked = output<Event>();
}
