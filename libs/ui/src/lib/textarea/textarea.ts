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
      class="w-full"
    ></textarea>
  `,
})
export class PdTextarea {
  readonly rows = input(3);
  readonly placeholder = input('');
  readonly disabled = input(false);
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
