import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { ListTicketsResult } from '@pulsedesk/contracts/tickets';
import { TicketPriority, TicketStatus } from '@pulsedesk/contracts/tickets';
import { TicketListStore } from './ticket-list.store';

describe('TicketListStore', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads the first page and stores the result', () => {
    const store = TestBed.inject(TicketListStore);
    expect(store.loading()).toBe(false);

    store.loadPage({ page: 1, pageSize: 20 });
    expect(store.loading()).toBe(true);

    const result: ListTicketsResult = {
      items: [
        {
          id: 't1',
          subject: 'Broken login',
          status: TicketStatus.NEW,
          priority: TicketPriority.URGENT,
          customerId: 'c1',
          assigneeId: null,
          slaPolicyId: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };

    httpMock
      .expectOne((req) => req.url === '/api/tickets' && req.method === 'GET')
      .flush(result);

    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.items()).toEqual(result.items);
    expect(store.total()).toBe(1);
  });

  it('surfaces an error and stops loading when the request fails', () => {
    const store = TestBed.inject(TicketListStore);
    store.loadPage({ page: 1, pageSize: 20 });

    httpMock
      .expectOne((req) => req.url === '/api/tickets')
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(store.loading()).toBe(false);
    expect(store.error()).not.toBeNull();
  });

  it('setFilters() resets to page 1 and sends only the active filters', () => {
    const store = TestBed.inject(TicketListStore);
    store.setFilters({
      status: TicketStatus.OPEN,
      priority: null,
      assigneeId: null,
    });

    const req = httpMock.expectOne((r) => r.url === '/api/tickets');
    expect(req.request.params.get('status')).toBe(TicketStatus.OPEN);
    expect(req.request.params.get('priority')).toBeNull();
    expect(req.request.params.get('page')).toBe('1');

    req.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(store.page()).toBe(1);
  });
});
