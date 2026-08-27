/**
 * Postgres `COUNT(*)` and `RANK()` are `bigint`, and `pg`/Prisma surface
 * that as a JS `bigint` — which `JSON.stringify` throws on. Every raw
 * aggregation query in this directory routes its `bigint` columns through
 * this before returning, so a Nest controller can serialize the result
 * directly.
 */
export function bigIntToNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}
