/** Column definition consumed by {@link PdTable}. Kept generic so any
 * feature can describe its columns without importing PrimeNG. */
export interface PdTableColumn<T> {
  field: Extract<keyof T, string>;
  header: string;
  sortable?: boolean;
}
