import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Tag } from 'primeng/tag';

/** Mirrors PrimeNG's `TagSeverity` union without importing PrimeNG's
 * internal type path — keeps `PdTag` consumers free of any direct
 * dependency on `primeng/*` types. */
export type PdTagSeverity =
  | 'success'
  | 'secondary'
  | 'info'
  | 'warn'
  | 'danger'
  | 'contrast';

/** Colored status/priority badge wrapping PrimeNG's `p-tag`. */
@Component({
  selector: 'pd-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tag],
  template: `<p-tag [value]="value()" [severity]="severity()" />`,
})
export class PdTag {
  readonly value = input.required<string>();
  readonly severity = input<PdTagSeverity>('secondary');
}
