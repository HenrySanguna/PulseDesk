import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import type { Ticket, TicketWithMessages } from '@pulsedesk/contracts/tickets';
import {
  MessageVisibility,
  TicketPriority,
  TicketStatus,
} from '@pulsedesk/contracts/tickets';
import { TicketDetailStore } from './ticket-detail.store';

function makeTicket(
  overrides: Partial<TicketWithMessages> = {},
): TicketWithMessages {
  return {
    id: 't1',
    subject: 'Broken login',
    status: TicketStatus.NEW,
    priority: TicketPriority.URGENT,
    customerId: 'c1',
    assigneeId: null,
    slaPolicyId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    ...overrides,
  };
}

describe('TicketDetailStore', () => {
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

  it('loads a ticket by id', () => {
    const store = TestBed.inject(TicketDetailStore);
    store.load('t1');
    expect(store.loading()).toBe(true);

    httpMock.expectOne('/api/tickets/t1').flush(makeTicket());

    expect(store.loading()).toBe(false);
    expect(store.ticket()?.id).toBe('t1');
  });

  it('claim() refetches the ticket on success', () => {
    const store = TestBed.inject(TicketDetailStore);
    store.load('t1');
    httpMock.expectOne('/api/tickets/t1').flush(makeTicket());

    store.claim();
    expect(store.claiming()).toBe(true);

    httpMock
      .expectOne(
        (req) => req.url === '/api/tickets/t1/claim' && req.method === 'POST',
      )
      .flush({ id: 't1' } as Ticket);

    expect(store.claiming()).toBe(false);

    // A successful claim triggers a refresh — expect the follow-up GET.
    httpMock
      .expectOne('/api/tickets/t1')
      .flush(makeTicket({ assigneeId: 'agent-1' }));

    expect(store.ticket()?.assigneeId).toBe('agent-1');
  });

  it('claim() surfaces a conflict without mutating the current ticket', () => {
    const store = TestBed.inject(TicketDetailStore);
    store.load('t1');
    httpMock.expectOne('/api/tickets/t1').flush(makeTicket());

    store.claim();
    httpMock
      .expectOne((req) => req.url === '/api/tickets/t1/claim')
      .flush('conflict', { status: 409, statusText: 'Conflict' });

    expect(store.claiming()).toBe(false);
    expect(store.actionError()).not.toBeNull();
    expect(store.ticket()?.assigneeId).toBeNull();
  });

  it('updateStatus() sends the chosen status and refreshes', () => {
    const store = TestBed.inject(TicketDetailStore);
    store.load('t1');
    httpMock.expectOne('/api/tickets/t1').flush(makeTicket());

    store.updateStatus(TicketStatus.OPEN);
    const req = httpMock.expectOne(
      (r) => r.url === '/api/tickets/t1/status' && r.method === 'PATCH',
    );
    expect(req.request.body).toEqual({ status: TicketStatus.OPEN });
    req.flush({ id: 't1' } as Ticket);

    httpMock
      .expectOne('/api/tickets/t1')
      .flush(makeTicket({ status: TicketStatus.OPEN }));

    expect(store.ticket()?.status).toBe(TicketStatus.OPEN);
  });

  it('sendMessage() posts the body/visibility and refreshes the thread', () => {
    const store = TestBed.inject(TicketDetailStore);
    store.load('t1');
    httpMock.expectOne('/api/tickets/t1').flush(makeTicket());

    store.sendMessage('On it', MessageVisibility.INTERNAL);
    const req = httpMock.expectOne(
      (r) => r.url === '/api/tickets/t1/messages' && r.method === 'POST',
    );
    expect(req.request.body).toEqual({
      body: 'On it',
      visibility: MessageVisibility.INTERNAL,
    });
    req.flush({ id: 'm1' });

    httpMock.expectOne('/api/tickets/t1').flush(
      makeTicket({
        messages: [
          {
            id: 'm1',
            ticketId: 't1',
            authorAgentId: 'agent-1',
            visibility: MessageVisibility.INTERNAL,
            body: 'On it',
            clientMessageId: null,
            createdAt: '2026-01-01T00:05:00.000Z',
          },
        ],
      }),
    );

    expect(store.ticket()?.messages).toHaveLength(1);
  });
});
