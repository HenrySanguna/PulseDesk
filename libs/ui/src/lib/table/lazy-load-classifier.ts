export interface PdTableLazyLoadState {
  first: number;
  rows: number;
}

export type PdTableLazyLoadDecision =
  | { kind: 'page'; first: number; rows: number }
  | { kind: 'sort'; field: string | null; order: number };

/**
 * Decides whether a PrimeNG `p-table` `onLazyLoad` event represents a
 * page/rows change (needs a refetch, since the caller owns pagination) or a
 * sort-only change on the already-loaded page (handled locally by
 * {@link sortRows}, since most list endpoints in this app — see
 * `GET /tickets` — have no sort query param).
 *
 * Pure and framework-free so it can be unit tested without Angular's
 * `TestBed` or a real `p-table` instance.
 */
export function classifyLazyLoad(
  current: PdTableLazyLoadState,
  event: {
    first?: number | null;
    rows?: number | null;
    sortField?: string | string[] | null;
    sortOrder?: number | null;
  },
): PdTableLazyLoadDecision {
  const nextFirst = event.first ?? 0;
  const nextRows = event.rows ?? current.rows;

  if (nextFirst !== current.first || nextRows !== current.rows) {
    return { kind: 'page', first: nextFirst, rows: nextRows };
  }

  // sortMode is always "single" in PdTable, so a single-element array and a
  // bare string both mean "sort by this one field".
  const field = Array.isArray(event.sortField)
    ? (event.sortField[0] ?? null)
    : (event.sortField ?? null);

  return { kind: 'sort', field, order: event.sortOrder ?? 1 };
}
