import { describe, expect, it } from 'vitest';
import { classifyLazyLoad } from './lazy-load-classifier.js';

describe('classifyLazyLoad', () => {
  it('classifies a first/rows change as a page change', () => {
    const decision = classifyLazyLoad(
      { first: 0, rows: 20 },
      { first: 20, rows: 20 },
    );
    expect(decision).toEqual({ kind: 'page', first: 20, rows: 20 });
  });

  it('classifies a rows-per-page change as a page change', () => {
    const decision = classifyLazyLoad(
      { first: 0, rows: 20 },
      { first: 0, rows: 50 },
    );
    expect(decision).toEqual({ kind: 'page', first: 0, rows: 50 });
  });

  it('classifies an unchanged first/rows with a sort field as sort-only', () => {
    const decision = classifyLazyLoad(
      { first: 0, rows: 20 },
      { first: 0, rows: 20, sortField: 'priority', sortOrder: -1 },
    );
    expect(decision).toEqual({
      kind: 'sort',
      field: 'priority',
      order: -1,
    });
  });

  it('unwraps a single-element sortField array (single sort mode)', () => {
    const decision = classifyLazyLoad(
      { first: 0, rows: 20 },
      { first: 0, rows: 20, sortField: ['status'], sortOrder: 1 },
    );
    expect(decision).toEqual({ kind: 'sort', field: 'status', order: 1 });
  });

  it('defaults order to 1 and field to null when neither is provided', () => {
    const decision = classifyLazyLoad(
      { first: 0, rows: 20 },
      { first: 0, rows: 20 },
    );
    expect(decision).toEqual({ kind: 'sort', field: null, order: 1 });
  });
});
