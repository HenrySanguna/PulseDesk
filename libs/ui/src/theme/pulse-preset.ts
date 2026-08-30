import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Community-tier PrimeUI license (free registration at primeui.store).
 * Designed to ship client-side — PrimeNG verifies it in the browser via
 * `providePrimeNG({ license, ... })` — so it's not a secret to protect,
 * same treatment as any other frontend-embedded license/API key.
 */
export const PRIMEUI_LICENSE_KEY =
  'eyJpZCI6ImRhNmMwOTcwLTBhMDctNGUxNC1hNzk4LWMxMWFlMGI4OTYwZSIsInByb2R1Y3QiOiJwcmltZXVpIiwidGllciI6ImNvbW11bml0eSIsInR5cGUiOiJkZXYiLCJpYXQiOjE3ODgwOTY1NTYsImV4cCI6MTgxOTYzMjU1Nn0.d_V6MyObaC1eEHAZLmglihEvO-v2P5RlTqElxKJzvxvEJgBwBGc_5-axa5T4e36VMg-NQW4Ic0PTEu0Xw4uBDA';

/**
 * Overrides only the `surface` and `primary` numbered ramps. Every other
 * semantic token (formField, content, overlay, text, highlight…) is
 * expressed in Aura's own source as `light-dark({surface.N}, {primary.N})`
 * references, so overriding just these two ramps — plus `:root { color-scheme:
 * dark }` in tokens.css, which forces every `light-dark()` to its dark
 * branch — recolors every PrimeNG component without touching per-component
 * presets or `::ng-deep`.
 */
export const PulsePreset = definePreset(Aura, {
  semantic: {
    surface: {
      0: '#e7edf2',
      50: '#e7edf2',
      100: '#c9d3db',
      200: '#a9b7c2',
      300: '#8b9ba8',
      400: '#7c8a99',
      // 500/600 back form-field border/hover-border in the dark branch
      // (Aura's `formField.borderColor`/`hoverBorderColor` tokens) — kept
      // bright enough to clear WCAG 1.4.11's 3:1 non-text contrast minimum
      // against both `#0b0f14` and `#131a21` (checked, see contrast-check.mjs
      // used while building this preset).
      500: '#6c7a86',
      600: '#5c6b78',
      700: '#2e3841',
      800: '#1f2831',
      900: '#131a21',
      950: '#0b0f14',
    },
    primary: {
      50: '#eafff5',
      100: '#c7fbe3',
      200: '#8ff5c4',
      300: '#6ef0b2',
      400: '#4df0a0',
      500: '#2fd98a',
      600: '#22b873',
      700: '#18965d',
      800: '#107548',
      900: '#0a5636',
      950: '#053b25',
    },
  },
});
