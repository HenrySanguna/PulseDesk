import type { InputSignal, Signal } from '@angular/core';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { UIChart } from 'primeng/chart';
import type { ChartData, ChartOptions, ChartType } from 'chart.js';

/** Chart.js draws on `<canvas>`, so it never inherits the page's CSS — every
 * text/gridline color has to be passed explicitly, or it renders in
 * Chart.js's own dark-on-transparent default, invisible against this app's
 * dark surfaces. Every `pd-chart` gets these merged in as its base. */
const DARK_THEME_DEFAULTS: ChartOptions = {
  color: '#e7edf2',
  plugins: {
    legend: {
      labels: { color: '#e7edf2' },
    },
  },
  scales: {
    x: {
      ticks: { color: '#7c8a99' },
      grid: { color: '#2e3841' },
    },
    y: {
      ticks: { color: '#7c8a99' },
      grid: { color: '#2e3841' },
    },
  },
};

/** Mirrors PrimeNG's `p-chart` `type` union without importing PrimeNG's
 * internal type path — same rationale as `PdButtonSeverity`/`PdTagSeverity`. */
export type PdChartType = ChartType;

/**
 * Wraps PrimeNG's `p-chart` (Chart.js, added by `06-add-polish` — the first
 * place in this app that needs a real chart). Deliberately NOT generic over
 * the specific chart type: Chart.js's own `ChartData<TType>`/`ChartOptions<TType>`
 * are not structurally assignable to `p-chart`'s own (non-generic, default
 * `ChartType`-union) `data`/`options` inputs — a known Chart.js/PrimeNG
 * typing rough edge (PrimeNG's own `UIChart.data` input silences the exact
 * same mismatch internally with `@ts-ignore`). Using the same wide default
 * types PrimeNG's public API itself exposes avoids that mismatch without
 * reaching for `any` anywhere in this file.
 */
@Component({
  selector: 'pd-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UIChart],
  template: `
    <p-chart
      [type]="type()"
      [data]="data()"
      [options]="mergedOptions()"
      [ariaLabel]="ariaLabel()"
    />
  `,
})
export class PdChart {
  readonly type = input.required<PdChartType>();
  // Explicit type annotations below (rather than relying on inference): TS's
  // composite-build declaration-portability check can't always name
  // Chart.js's own internal generic utility types in the emitted `.d.ts`
  // without one.
  readonly data: InputSignal<ChartData> = input.required<ChartData>();
  readonly options: InputSignal<ChartOptions> = input<ChartOptions>({});
  readonly ariaLabel = input('');

  protected readonly mergedOptions: Signal<ChartOptions> = computed(() => ({
    ...DARK_THEME_DEFAULTS,
    ...this.options(),
  }));
}
