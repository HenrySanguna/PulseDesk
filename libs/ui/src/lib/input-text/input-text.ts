import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  model,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { InputText } from 'primeng/inputtext';

/** Single-line text input wrapping PrimeNG's `pInputText` directive. Same
 * internal Reactive-Forms bridge pattern as {@link PdSelect} — see there for
 * the rationale. */
@Component({
  selector: 'pd-input-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InputText, ReactiveFormsModule],
  template: `
    <input
      pInputText
      [type]="type()"
      [formControl]="control"
      [placeholder]="placeholder()"
      class="w-full"
    />
  `,
})
export class PdInputText {
  readonly type = input<'text' | 'password' | 'email'>('text');
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
