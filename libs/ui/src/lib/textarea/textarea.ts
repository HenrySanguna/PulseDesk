import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  model,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Textarea } from 'primeng/textarea';

/** Multi-line text input wrapping PrimeNG's `pTextarea` directive. Same
 * internal Reactive-Forms bridge pattern as {@link PdSelect} — see there for
 * the rationale. */
@Component({
  selector: 'pd-textarea',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Textarea, ReactiveFormsModule],
  template: `
    <textarea
      pTextarea
      [formControl]="control"
      [rows]="rows()"
      [placeholder]="placeholder()"
      [attr.aria-label]="ariaLabel() || null"
      class="w-full {{ textareaClass() }}"
    ></textarea>
  `,
})
export class PdTextarea {
  readonly rows = input(3);
  readonly placeholder = input('');
  readonly disabled = input(false);
  /** Accessible name for this textarea (tasks.md 5.2) — required whenever a
   * consumer doesn't already associate a real `<label for>` with it (every
   * call site in this app today relies on a nearby visual label instead). */
  readonly ariaLabel = input('');
  /** Extra Tailwind classes appended to the native `<textarea>` (e.g. a
   * larger `rounded-*` for a call site that wants a softer, pill-like
   * composer input than the shared default). Opt-in, empty by default. */
  readonly textareaClass = input('');
  readonly value = model('');

  protected readonly control = new FormControl('', { nonNullable: true });

  constructor() {
    effect(() => {
      const next = this.value();
      if (this.control.value !== next) {
        this.control.setValue(next, { emitEvent: false });
      }
    });
    effect(() => {
      if (this.disabled()) {
        this.control.disable({ emitEvent: false });
      } else {
        this.control.enable({ emitEvent: false });
      }
    });
    this.control.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((next) => this.value.set(next));
  }
}
