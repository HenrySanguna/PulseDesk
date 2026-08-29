/** Generic comparator for client-side sorting of an already-loaded table
 * page (strings, numbers, nulls). Pure and framework-free so it can be unit
 * tested without Angular's `TestBed`. */
export function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return -1;
  }
  if (b == null) {
    return 1;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Returns a new array sorted by `field` using {@link compareValues}.
 * Returns `rows` unchanged (same reference) when `field` is `null`. */
export function sortRows<T extends object>(
  rows: T[],
  field: keyof T | null,
  order: number,
): T[] {
  if (!field) {
    return rows;
  }
  return [...rows].sort((a, b) => compareValues(a[field], b[field]) * order);
}
