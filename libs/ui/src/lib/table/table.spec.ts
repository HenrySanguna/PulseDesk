import { TestBed } from '@angular/core/testing';
import { PdTable } from './table';
import type { PdTableColumn } from './table-column';

interface Row {
  id: string;
  name: string;
}

/**
 * Closes CRITICAL 2 (06-add-polish verify-report.md): `table.html`'s
 * `tabindex`/`role="button"`/`(keydown.enter)`/`(keydown.space)` row
 * handlers were real but had zero Angular `TestBed` coverage — only the
 * plain, framework-free `sortRows`/`classifyLazyLoad` helpers `PdTable`
 * delegates to were tested. This renders the real component (real
 * `p-table`, real DOM) and dispatches real `KeyboardEvent`s, proving the
 * actual keyboard-activation behavior spec.md's "Navegación completa por
 * teclado" scenario describes — not just that the template has the right
 * attributes.
 */
describe('PdTable — keyboard row activation', () => {
  const rows: Row[] = [
    { id: '1', name: 'Alice' },
    { id: '2', name: 'Bob' },
  ];
  const columns: PdTableColumn<Row>[] = [{ field: 'name', header: 'Name' }];

  function createFixture() {
    const fixture = TestBed.createComponent<PdTable<Row>>(PdTable);
    fixture.componentRef.setInput('value', rows);
    fixture.componentRef.setInput('columns', columns);
    fixture.componentRef.setInput('paginator', false);
    fixture.detectChanges();
    return fixture;
  }

  function bodyRows(
    fixture: ReturnType<typeof createFixture>,
  ): HTMLTableRowElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('tr[role="button"]'),
    );
  }

  it('activates the focused row on Enter, the same output a mouse click fires', () => {
    const fixture = createFixture();
    const emitted: Row[] = [];
    fixture.componentInstance.rowClick.subscribe((row) => emitted.push(row));

    const [firstRow] = bodyRows(fixture);
    firstRow.focus();
    firstRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(emitted).toEqual([rows[0]]);
  });

  it('activates the focused row on Space, exactly like Enter', () => {
    const fixture = createFixture();
    const emitted: Row[] = [];
    fixture.componentInstance.rowClick.subscribe((row) => emitted.push(row));

    const [, secondRow] = bodyRows(fixture);
    secondRow.focus();
    secondRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
    );

    expect(emitted).toEqual([rows[1]]);
  });

  it('does not activate a row for an unrelated key (e.g. Tab)', () => {
    const fixture = createFixture();
    const emitted: Row[] = [];
    fixture.componentInstance.rowClick.subscribe((row) => emitted.push(row));

    const [firstRow] = bodyRows(fixture);
    firstRow.focus();
    firstRow.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    );

    expect(emitted).toEqual([]);
  });

  it('every body row is a real, Tab-reachable focus target — the actual "no mouse" prerequisite', () => {
    const fixture = createFixture();
    for (const row of bodyRows(fixture)) {
      expect(row.tabIndex).toBe(0);
    }
  });
});
