import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The product's signature "live" indicator: an animated ECG trace replacing
 * the generic solid-dot pattern. The trace only *moves* while `connected()`
 * is true — a frozen glyph reads as "no live signal", reinforcing the label
 * instead of just decorating it. Respects `prefers-reduced-motion` (freezes,
 * never disappears) via the stylesheet's media query, not a JS check, so it
 * degrades correctly even before change detection runs.
 */
@Component({
  selector: 'pd-pulse-trace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="pd-pulse-trace inline-flex items-center gap-1.5 text-sm"
      [class.pd-pulse-trace--live]="connected()"
    >
      <svg
        class="pd-pulse-trace__svg"
        width="28"
        height="14"
        viewBox="0 0 120 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          class="pd-pulse-trace__path"
          d="M0,12 L28,12 L34,3 L41,21 L47,12 L58,12 L64,5 L70,19 L76,12 L120,12"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      {{ label() }}
    </span>
  `,
  styles: `
    .pd-pulse-trace {
      color: var(--p-surface-400, #7c8a99);
    }

    .pd-pulse-trace--live {
      color: var(--color-pulse);
    }

    .pd-pulse-trace__path {
      stroke-dasharray: 22 210;
      stroke-dashoffset: 0;
    }

    .pd-pulse-trace--live .pd-pulse-trace__path {
      animation: pd-pulse-sweep 1.8s linear infinite;
    }

    @keyframes pd-pulse-sweep {
      to {
        stroke-dashoffset: -232;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pd-pulse-trace--live .pd-pulse-trace__path {
        animation: none;
        stroke-dasharray: none;
      }
    }
  `,
})
export class PdPulseTrace {
  readonly connected = input(true);
  readonly label = input('Live');
}
