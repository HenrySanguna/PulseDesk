import { describe, expect, it } from 'vitest';
import { compareValues, sortRows } from './sort-rows.js';

describe('compareValues', () => {
  it('sorts strings with localeCompare', () => {
    expect(compareValues('b', 'a')).toBeGreaterThan(0);
    expect(compareValues('a', 'b')).toBeLessThan(0);
    expect(compareValues('a', 'a')).toBe(0);
  });

  it('sorts numbers', () => {
    expect(compareValues(1, 2)).toBeLessThan(0);
    expect(compareValues(2, 1)).toBeGreaterThan(0);
  });

  it('pushes null/undefined values to the front', () => {
    expect(compareValues(null, 'a')).toBeLessThan(0);
    expect(compareValues('a', null)).toBeGreaterThan(0);
    expect(compareValues(null, null)).toBe(0);
  });
});

describe('sortRows', () => {
  interface Row {
    id: string;
    priority: number;
  }

  const rows: Row[] = [
    { id: 'a', priority: 2 },
    { id: 'b', priority: 1 },
    { id: 'c', priority: 3 },
  ];

  it('returns the same reference when field is null (no sort applied)', () => {
    expect(sortRows(rows, null, 1)).toBe(rows);
  });

  it('sorts ascending when order is 1', () => {
    expect(sortRows(rows, 'priority', 1).map((r) => r.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('sorts descending when order is -1', () => {
    expect(sortRows(rows, 'priority', -1).map((r) => r.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    sortRows(rows, 'priority', 1);
    expect(rows).toEqual(copy);
  });
});
