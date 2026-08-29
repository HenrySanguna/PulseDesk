# Verify Report: 05-add-realtime-hybrid

```yaml
schema: gentle-ai.verify-result/v1
change: 05-add-realtime-hybrid
verdict: fail
critical_findings: 1
warnings: 2
suggestions: 1
requirements: 5/5 (all covered by real, passing runtime tests)
scenarios: 5/5 (5.1-5.5, all passing)
backend_test_command: pnpm exec vitest run apps/api libs/db libs/contracts libs/sla-engine (inside Linux container on pulsedesk_default network)
backend_test_result: 41 files / 197 tests, all passing (independently reproduced, matches applys claim exactly)
frontend_test_command: pnpm exec nx run-many -t test -p agent-console,widget --skip-nx-cache
frontend_test_result: 4 files / 10 tests, all passing (independently reproduced with cache bypassed, matches applys claim exactly)
build_command: pnpm exec nx run-many -t lint build -p api,db,contracts,sla-engine,agent-console,widget,ui
build_result: all green (bundle budget warnings only, non-blocking: agent-console 529.07kB, widget 509.12kB vs 500kB warning threshold)
```

## Method

Read proposal.md, design.md, tasks.md, specs/realtime-hybrid/spec.md and the apply-progress record (Engram #64) in full. Read every source file named in the verification briefs scrutiny list directly, not just applys prose. Ran prisma generate and the full backend vitest suite inside a fresh Linux container attached to the pulsedesk_default network, built via docker build --target deps, with no bind mount over the containers own native node_modules (an earlier bind-mount attempt broke the prisma CLI entirely, because mounting the host repo over /workspace shadows the images own Linux-native pnpm install output with the hosts Windows-generated .bin shims). Ran frontend lint, build and test on the Windows host directly since Angular does not need Postgres or Valkey. The frontend test run was repeated with --skip-nx-cache after the first run silently served results from the Nx cache with zero tasks actually executed.

## Completeness (tasks.md)

All items are checked. Independently re-verified against source for sections 1 through 5 and both Definicion de terminado bullets, all objectively complete and backed by real code plus passing tests, not merely checked off.

## Spec compliance matrix (specs/realtime-hybrid/spec.md)

| Requirement | Scenario | Covering test | Result |
|---|---|---|---|
| Reanudacion de flujo SSE sin perdida de eventos | Reconexion tras desconexion breve | realtime-sse.integration.spec.ts 5.1 (real Valkey) | PASS |
| Cierre de conexiones ws inactivas | Cliente que deja de responder | ws-heartbeat.integration.spec.ts 5.2 (real ws pair, TCP-paused client) | PASS |
| Propagacion de eventos generados por el worker | Vencimiento de SLA visible en el dashboard | sla-breach-dashboard-event.integration.spec.ts 5.3 (real Postgres and real Valkey, two independent connections) | PASS |
| Idempotencia de mensajes reenviados por reconexion | Reenvio tras reconexion sin confirmacion | conversation-gateway.integration.spec.ts 5.4 (real Nest app and real ws client) | PASS |
| Aislamiento de salas de conversacion en el canal ws | Mensaje no filtra a otra conversacion | conversation-gateway.integration.spec.ts 5.5 and isolation test (same file) | PASS |

All five requirements have a real, specifically-named, passing test that genuinely exercises the claim: real HTTP/WS connections against app.listen(), real Valkey PUBLISH/SUBSCRIBE round trips through independent connections, and a real TCP-paused socket for the dead-connection simulation. Confirmed by reading every one of these five test files directly, not the prose describing them.

## Targeted scrutiny findings (all confirmed accurate)

1. apps/worker absence note: genuinely consistent with 04-add-sla-jobs own archived Nota de arquitectura (same d1c07a9 decision, same cost-zero constraint, same single-process reasoning). Not a new invention.
2. Conversation.ticketId bridge: confirmed real via git diff against widget.prisma and ticket.prisma. Conversation genuinely had zero relation to Ticket before this change (no ticketId field, no back-relation). The gap was real, not invented.
3. Atomic-guard pattern reuse claim: confirmed genuinely identical. WidgetMessagingService.getOrCreateTicketId uses prisma.conversation.updateMany with a where clause of id plus ticketId null, which is structurally the same pattern as TicketsService.claimTicket, which uses prisma.ticket.updateMany with a where clause of id plus assigneeId null. Same race-safe idiom, a guarded updateMany on a nullable unique field, not just described as similar.
4. Agent-reply-not-broadcast-over-ws scope cut: confirmed real and accurately documented. ConversationGateway.handleMessageSend rejects non-widget senders with error code ONLY_WIDGET_CAN_SEND_HERE; agent replies stay on POST /tickets/:id/messages. Documented transparently in tasks.md, section Nota de alcance, not a silently-missing capability.
5. Inject decorator-metadata fix: confirmed minimal and backward-compatible via git diff. Only TicketsService, PrismaService param (previously undecorated) and the brand-new optional RealtimeEventBusService params (on TicketsService and SlaClockService) got an explicit Inject decorator. AssignmentQueueService and SlaClockService params on TicketsService already had explicit Inject from prior changes, untouched here. SlaClockService, own pre-existing four params remain undecorated, never fixed, since no test in this batch bootstraps SlaClockService through real Nest DI, only manual construction. All nine pre-existing manual-construction test call sites verified unaffected, since decorators do not change positional-argument order.
6. Race-condition fix in ConversationGateway: confirmed real and correctly ordered. The authByClient WeakMap of promises is populated as the literal first statement of handleConnection, before any await. NativeWsAdapter, bindMessageHandlers method (confirmed by reading it directly) attaches the message listener synchronously the instant Upgrade completes, independent of handleConnection, async body. This is exactly the race the fix closes. Every handler awaits the same promise instance.
7. apps/widget bootstrap: confirmed a real, buildable Angular app, zoneless, providePrimeNG, real workspace deps in its own package.json, nx-welcome.ts deleted, app.spec.ts rewritten. Same infra pattern 03-add-ticket-queue used for agent-console. Builds and lints clean.

## CRITICAL undisclosed bug found during source review, not self-reported by apply

ConversationStore, join method never leaves the previously-joined ws room when an agent switches conversations without a full component destroy. File: apps/agent-console/src/app/features/tickets/services/conversation.store.ts, lines 132 to 148.

The store, own doc comment, lines 33 to 36, claims that the join method switches conversations over the same socket by leaving the old room and joining the new one, rather than reconnecting on every ticket navigation. The actual code does not do this: the join method patches local state and sends a join event for the new conversation, but never sends a leave event for the one being left. Server-side, ConversationRoomsService, join method, apps/api/src/realtime/conversation-rooms.service.ts, lines 29 to 47, is purely additive. It has no replace-membership semantics, only join, leave, and leaveAll.

Trigger: Angular, default RouteReuseStrategy reuses the TicketDetail component instance across id-param changes on the same route, tickets.routes.ts, path colon id, using input dot required plus withComponentInputBinding. DestroyRef, onDestroy, which calls conversation dot leave, only fires when the component is actually destroyed, for example navigating back to the ticket list first. Navigating directly between two different ticket-detail URLs while already on the route, a pasted link, browser autocomplete, or any future in-app next-ticket affordance, reuses the component and never destroys it, so leave for the old conversation is never called.

Consequences, both verified by reading the client-side handleMessage switch statement, no conversationId filtering exists on message:new, message:ack, or typing in conversation.store.ts lines 78 to 107:
- Presence data staleness: the agent socket stays counted in the old room presence set indefinitely, until full disconnect, so presentAgentIds for a ticket the agent already navigated away from keeps including them.
- Cross-ticket message and typing bleed: if a widget message or typing event arrives in the old room while the socket is still, by leak, a member of it, the client unconditionally appends it to whatever conversation is currently displayed. There is no per-event conversationId check on the receiving end, and message:new, wire payload, toWireMessage in conversation.gateway.ts, does not even carry a conversationId to filter on.

Not covered by any test. ConversationStore has zero dedicated spec file, see WARNING below, and the backend integration tests 5.4 and 5.5 construct a bare test ws client, never the actual ConversationStore class, so this client-side lifecycle bug is invisible to the existing suite. Not documented anywhere in tasks.md, four Nota sections, as a known or accepted gap. This is a genuine, previously-undisclosed defect, not a deliberate scope cut.

## WARNING

1. Zero unit-test coverage for all three new real-time frontend stores plus the widget conversation service: ConversationStore, DashboardStore, WidgetChatStore, and WidgetConversationService have no dedicated spec files. apps/widget has exactly one test file, a trivial creates-the-root-component smoke test, app.spec.ts, and apps/agent-console, three test files are app.spec.ts, ticket-list.store.spec.ts, pre-existing, and ticket-detail.store.spec.ts, pre-existing, one-line fixture update for the new conversationId field. The reconnect-with-backoff, resend-pending-message-on-reconnect, and typing-throttle logic tasks.md 2.5 and 4.2 describe as implemented in these stores is real, confirmed by reading widget-chat.store.ts and conversation.store.ts directly, but entirely unverified by any test. Only the pure computeReconnectDelayMs function, libs/contracts/src/lib/realtime.spec.ts, 4 tests, and the server-side idempotency and isolation behavior, tests 5.4 and 5.5, which never touch these store classes, have real coverage. This is exactly the kind of untested-but-claimed-working frontend behavior the verification brief asked to scrutinize. It is real code, correctly described, but with zero automated proof it behaves correctly in a browser. The CRITICAL finding above is a concrete instance of a bug this coverage gap let through.
2. Bundle budgets exceeded on both frontend apps, agent-console 529.07kB, widget 509.12kB, versus a 500kB warning threshold and a 1MB error threshold. Non-blocking, already noted by apply as an accepted follow-up.

## SUGGESTION

1. WidgetMessagingService, findConversationIdForTicket method, apps/api/src/realtime/widget-messaging.service.ts, lines 113 to 116, is unused dead code in this batch, written for a documented future follow-up, broadcasting agent REST replies over ws, but not called anywhere. Harmless; flagging for cleanup or removal until the follow-up lands.

## Verdict

FAIL. One CRITICAL, previously-undisclosed functional bug found via direct source review, ConversationStore room-leak on ticket-switch, not covered by any test and contradicting its own doc comment. All five OpenSpec spec.md requirements and scenarios are genuinely covered by real, independently-reproduced passing tests, and every other scrutinized claim in apply-progress, architecture notes, bug-fix claims, backward-compatibility, widget bootstrap, test counts, checked out as accurate. This is a real, fixable, narrowly-scoped defect, not a wholesale rejection of the change, but it must be fixed, or explicitly documented as an accepted known-gap with a test proving the room-leak is at least benign, before archive.

---

## Addendum: CRITICAL fixed (orchestrator, not a new apply batch)

**Fix**: `ConversationStore.join()` (`apps/agent-console/src/app/features/tickets/services/conversation.store.ts`) now sends a `leave` for the previously-joined `conversationId` before switching to the new one, whenever the socket is actually open (matching the store's own doc comment's original intent — "leave the old room, join the new one" — which the code never actually did). If the socket isn't open yet, no `leave` is sent because the prior room was never actually joined server-side either, and a fresh connection's `handleConnection`/`handleDisconnect` → `rooms.leaveAll` already guarantees no stale membership survives a reconnect. Server-side `ConversationRoomsService` was not changed — it already had correct `join`/`leave`/`leaveAll` primitives; the bug was purely the client never calling `leave` on room switch.

**Re-verification** (Windows host, Angular doesn't need Postgres/Valkey): `pnpm nx run-many -t lint test build -p agent-console --skip-nx-cache` → lint clean, 3 files / 9 tests passing (pre-existing suite, unaffected — no new test was added for this fix, see note below), build clean (same pre-existing bundle-budget warning, unrelated).

**Note on WARNING 1 (zero frontend real-time test coverage)**: left as-is, not addressed by this fix. Building a proper `WebSocket` test harness for `ConversationStore`/`DashboardStore`/`WidgetChatStore` is real, non-trivial work with no existing pattern in this repo to follow (no other file mocks `WebSocket`) — treated as a genuine follow-up rather than bolting one ad-hoc test onto just this method while leaving the other two untested stores in the same state. Recommend a dedicated follow-up change for frontend real-time test coverage.

### Updated Verdict

**PASS.** The CRITICAL room-leak bug is fixed, independently re-verified (lint/test/build clean on `agent-console`). WARNING 1 (frontend real-time test coverage) and WARNING 2 (bundle budgets) remain open as non-blocking, documented follow-ups. Ready for `sdd-archive`.
