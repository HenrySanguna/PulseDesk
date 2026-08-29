import { Route } from '@angular/router';

export const TICKET_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/ticket-list/ticket-list').then((m) => m.TicketList),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/ticket-detail/ticket-detail').then(
        (m) => m.TicketDetail,
      ),
  },
];
