import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  contentChildren,
  input,
  output,
  signal,
} from '@angular/core';
import { SortIcon, SortableColumn, Table } from 'primeng/table';
import type { TableLazyLoadEvent } from 'primeng/table';
import { PdColumnTemplateDirective } from './column-template.directive';
import { classifyLazyLoad } from './lazy-load-classifier';
import { sortRows } from './sort-rows';
import type { PdTableColumn } from './table-column';

export interface PdTablePageEvent {
  first: number;
  rows: number;
}

/**
 * Server-paginated data table wrapping PrimeNG's `p-table`. Always runs in
 * lazy mode: the caller owns fetching pages and passes the current page's
 * `value` plus `totalRecords`/`first`/`rows` back down as inputs.
 *
 * Column sorting is handled entirely client-side against the already-loaded
 * page — most list endpoints in this app (see `GET /tickets`) don't accept a
 * sort query param, so clicking a sortable header never triggers a refetch.
 * The actual page-vs-sort decision and comparator live in
 * `lazy-load-classifier.ts` / `sort-rows.ts` as plain functions so that
 * logic is unit-testable without Angular's `TestBed`.
 */
@Component({
  selector: 'pd-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Table, SortableColumn, SortIcon, NgTemplateOutlet],
  templateUrl: './table.html',
})
export class PdTable<T extends object> {
  readonly value = input.required<T[]>();
  readonly columns = input.required<PdTableColumn<T>[]>();
  readonly loading = input(false);
  readonly paginator = input(true);
  readonly rows = input(20);
  readonly first = input(0);
  readonly totalRecords = input(0);
  readonly dataKey = input('id');

  readonly rowClick = output<T>();
  readonly page = output<PdTablePageEvent>();

  private readonly columnTemplates =
    contentChildren(PdColumnTemplateDirective);

  private readonly sortField = signal<string | null>(null);
  private readonly sortOrder = signal(1);

  protected readonly sortedValue = computed<T[]>(() =>
    sortRows(
      this.value(),
      this.sortField() as keyof T | null,
      this.sortOrder(),
    ),
  );

  protected templateFor(field: string): TemplateRef<unknown> | undefined {
    return this.columnTemplates().find((t) => t.field() === field)
      ?.templateRef;
  }

  protected handleLazyLoad(event: TableLazyLoadEvent): void {
    const decision = classifyLazyLoad(
      { first: this.first(), rows: this.rows() },
      event,
    );

    if (decision.kind === 'page') {
      this.page.emit({ first: decision.first, rows: decision.rows });
      return;
    }

    this.sortField.set(decision.field);
    this.sortOrder.set(decision.order);
  }
}
