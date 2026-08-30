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
      [rounded]="rounded()"
      [disabled]="disabled()"
      [loading]="loading()"
      [icon]="icon()"
      [ariaLabel]="ariaLabel() || undefined"
      [type]="type()"
      styleClass="transition-transform duration-150 ease-out active:scale-[0.97]"
      (onClick)="clicked.emit($event)"
    />
  `,
})
export class PdButton {
  readonly label = input('');
  readonly severity = input<PdButtonSeverity>();
  readonly type = input<'button' | 'submit'>('button');
  readonly outlined = input(false);
  /** Pill-shaped (PrimeNG's own "rounded" button variant) — used for
   * compact composer-row actions (e.g. widget chat's Send button) rather
   * than the default, more square action-button radius. */
  readonly rounded = input(false);
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly icon = input('');
  readonly ariaLabel = input('');
  readonly clicked = output<Event>();
}
