import { Directive, TemplateRef, inject, input } from '@angular/core';

/**
 * Lets a feature project a custom cell renderer into {@link PdTable} for one
 * column, without the feature importing anything from PrimeNG:
 *
 * ```html
 * <pd-table [value]="tickets()" [columns]="columns">
 *   <ng-template pdColumnTemplate="status" let-ticket>
 *     <pd-tag [value]="ticket.status" />
 *   </ng-template>
 * </pd-table>
 * ```
 */
@Directive({ selector: 'ng-template[pdColumnTemplate]' })
export class PdColumnTemplateDirective {
  readonly field = input.required<string>({ alias: 'pdColumnTemplate' });
  readonly templateRef = inject(TemplateRef);
}
