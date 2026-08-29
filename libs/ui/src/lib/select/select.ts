import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  model,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Select } from 'primeng/select';

export interface PdSelectOption<T> {
  label: string;
  value: T;
}

/**
 * Labeled dropdown wrapping PrimeNG's `p-select`. Exposes a plain signal
 * `[(value)]` two-way binding to consumers; internally it bridges to a
 * private Reactive Forms `FormControl` because `p-select` only integrates
 * via `ControlValueAccessor` — this keeps `FormsModule`/`ngModel` (and any
 * template-driven forms usage) out of every consumer of this component.
 */
@Component({
  selector: 'pd-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Select, ReactiveFormsModule],
  templateUrl: './select.html',
})
export class PdSelect<T> {
  readonly options = input.required<PdSelectOption<T>[]>();
  readonly placeholder = input('');
  readonly clearable = input(false);
  readonly disabled = input(false);
  readonly value = model<T | null>(null);

  protected readonly control = new FormControl<T | null>(null);

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
