import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless, per the same non-negotiable frontend stack `agent-console`
    // uses (openspec/project.md) — this app is embeddable, so keeping it
    // small and zone.js-free matters even more here.
    provideZonelessChangeDetection(),
    provideHttpClient(withFetch()),
    // Required for `@pulsedesk/ui`'s PrimeNG-backed components (PdButton,
    // PdTextarea) — same theme/layer setup as `agent-console`'s app.config.ts.
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: false,
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities',
          },
        },
      },
    }),
  ],
};
