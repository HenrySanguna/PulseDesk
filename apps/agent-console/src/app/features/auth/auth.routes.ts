import { Route } from '@angular/router';

export const AUTH_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/login/login').then((m) => m.Login),
  },
];
