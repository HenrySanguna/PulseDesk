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
import Aura from '@primeuix/themes/aura';
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
