import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { PRIMEUI_LICENSE_KEY, PulsePreset } from '@pulsedesk/ui/theme';
import { providePrimeNG } from 'primeng/config';
import { appRoutes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Required for OnPush + signals to actually trigger re-renders: this
    // app ships without zone.js (see openspec/project.md — Angular
    // "standalone, zoneless, Signals" is the non-negotiable frontend stack).
    provideZonelessChangeDetection(),
    // Binds route params directly to matching component `input()`s (e.g.
    // `TicketDetail.id`), so the signals-first convention extends to
    // routing without a manual `ActivatedRoute` subscription.
    provideRouter(appRoutes, withComponentInputBinding()),
    // withFetch(): avoids pulling in zone.js-patched XHR: the fetch-based
    // backend has no zone dependency, consistent with running zoneless.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    providePrimeNG({
      license: PRIMEUI_LICENSE_KEY,
      theme: {
        preset: PulsePreset,
        options: {
          // No light/dark toggle exists — this app is dark-only. PrimeNG's
          // `false` option (no dark mode at all) forces `color-scheme:
          // light` on `:root` unconditionally via its own `primeng` CSS
          // layer, which sits after `tailwind-base` in `cssLayer.order`
          // below and so overrides any `color-scheme: dark` declared there.
          // Scoping dark to a permanently-present class sidesteps that.
          darkModeSelector: '.p-dark',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities',
          },
        },
      },
    }),
  ],
};
