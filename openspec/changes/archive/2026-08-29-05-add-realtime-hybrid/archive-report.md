# Archive Report: 05-add-realtime-hybrid

**Change**: 05-add-realtime-hybrid  
**Archived**: 2026-08-29  
**Repository**: pulsedesk (commit 6a289af)  
**Verdict**: **PASS** (with non-blocking follow-ups)

---

## Final State Summary

This change implements a realtime hybrid transport layer for PulseDesk:

- **SSE (Server-Sent Events)** for unidirectional dashboard updates with `Last-Event-ID` resume capability
- **Native `ws` adapter** for bidirectional chat with native authentication, room management, and heartbeat
- **Valkey pub/sub bus** for routing worker-generated events (SLA breaches, escalations) to multiple API instances
- **Widget embeddable chat** with client message idempotency and reconnection-safe message resend
- **Agent-side real-time indicators** for typing and presence in the Conversation component

### Implementation Completeness

- **Backend**: SSE controller + heartbeat + Last-Event-ID resume, native `ws` adapter + rooms + auth + heartbeat, Valkey pub/sub bus, widget services
- **Frontend**: Agent console dashboard store (SSE), chat store (ws + reconnect + backoff), widget chat page and services
- **Tests**: 41 backend files / 197 tests (all passing), 4 frontend files / 10 tests (all passing)
- **Spec domain**: `openspec/specs/realtime-hybrid/` created with 5 requirements, all verified by real integration tests
- **Schema**: Conversation bridge to Ticket added (`Conversation.ticketId`, migration `20260829160231_add_realtime_conversation_ticket_bridge`)

### Verification Status

**Verdict from `verify-report.md` Addendum** (orchestrator re-verification after fix, 2026-08-29):

> **PASS.** The CRITICAL room-leak bug is fixed, independently re-verified (lint/test/build clean on `agent-console`). WARNING 1 (frontend real-time test coverage) and WARNING 2 (bundle budgets) remain open as non-blocking, documented follow-ups. Ready for `sdd-archive`.

**What was fixed**:
- `ConversationStore.join()` (`apps/agent-console/src/app/features/tickets/services/conversation.store.ts`) now properly sends `leave` for the previous conversation before joining a new one. The bug was that Angular's default RouteReuseStrategy reuses the TicketDetail component across route param changes, so `onDestroy` (which calls `leave`) was never called on ticket navigation. The fix ensures the WebSocket leaves the old room before joining the new one whenever the socket is open.
- Re-verified: `pnpm nx run-many -t lint test build -p agent-console --skip-nx-cache` → all passing (3 files / 9 tests, no regressions)

### Critical Issue Resolution

The verify phase discovered one critical undisclosed defect:
- **Issue**: `ConversationStore.join()` method never left the previously-joined WebSocket room when an agent switched conversations without destroying the component
- **Impact**: Stale presence data, cross-ticket message and typing bleed to wrong conversations
- **Resolution**: Fixed by sending `leave` for the previous `conversationId` before joining new one (lines 132-148, async guard added for socket-open check)
- **Verification**: Independent re-run after fix confirmed lint/test/build clean on agent-console
- **Status**: Resolved and ready for archive

---

## Specs Synced

### Domain: realtime-hybrid (NEW)

**File**: `openspec/specs/realtime-hybrid/spec.md`  
**Source**: Delta spec from `openspec/changes/05-add-realtime-hybrid/specs/realtime-hybrid/spec.md`  
**Action**: Created (new domain)  
**Requirements Added**: 5

| Requirement | Scenario | Test Coverage |
|---|---|---|
| Reanudación de flujo SSE sin pérdida de eventos | Reconexión tras desconexión breve | realtime-sse.integration.spec.ts (real Valkey) |
| Cierre de conexiones `ws` inactivas | Cliente que deja de responder | ws-heartbeat.integration.spec.ts (real ws, TCP-paused) |
| Propagación de eventos generados por el worker | Vencimiento de SLA visible en dashboard | sla-breach-dashboard-event.integration.spec.ts (real Postgres + Valkey) |
| Idempotencia de mensajes reenviados por reconexión | Reenvío tras reconexión sin confirmación | conversation-gateway.integration.spec.ts (real Nest + ws client) |
| Aislamiento de salas de conversación en `ws` | Mensaje no filtra a otra conversación | conversation-gateway.integration.spec.ts (broadcast isolation + join-reject) |

**Verification**: All 5 requirements covered by real, independently-reproduced passing integration tests with real external services (Postgres, Valkey, native `ws` sockets).

---

## Archive Contents

✅ **Artifacts Archived**
- `proposal.md` — Change intent and scope (separate transports for dashboard vs. chat)
- `design.md` — Technical rationale for SSE and native `ws` choices
- `tasks.md` — 42 implementation tasks, all checked (1.1-1.4 SSE, 2.1-2.7 ws, 3.1-3.2 bus, 4.1-4.2 widget, 5.1-5.5 tests, plus 2 Definición de terminado bullets)
- `specs/realtime-hybrid/spec.md` — 5 requirements, 5 scenarios
- `verify-report.md` — Full verification report with CRITICAL bug discovery, fix, and re-verification

✅ **Archived Location**
- `openspec/changes/archive/2026-08-29-05-add-realtime-hybrid/`

---

## Observation IDs (Engram Traceability)

For hybrid mode artifact tracking:

| Artifact | Topic Key | ID | Source | Status |
|---|---|---|---|---|
| verify-report | sdd/05-add-realtime-hybrid/verify-report | #65 | Engram | Found |
| proposal | sdd/05-add-realtime-hybrid/proposal | — | filesystem | Primary (openspec) |
| design | sdd/05-add-realtime-hybrid/design | — | filesystem | Primary (openspec) |
| spec | sdd/05-add-realtime-hybrid/spec | — | filesystem + `openspec/specs/realtime-hybrid/spec.md` | Primary (merged to main) |
| tasks | sdd/05-add-realtime-hybrid/tasks | — | filesystem | Primary (openspec) |

**Hybrid Mode Storage**: Proposal, design, spec, and tasks live in the openspec filesystem (primary source). Verify-report found in Engram (#65). Archive report persisted to both Engram and filesystem.

---

## Follow-ups (Non-Blocking)

These warnings remain as documented follow-ups, not blockers:

### WARNING 1: Zero Unit-Test Coverage for Frontend Real-Time Stores

**Issue**: `ConversationStore`, `DashboardStore`, `WidgetChatStore`, and `WidgetConversationService` have no dedicated spec files. The reconnect-with-backoff, resend-pending-message-on-reconnect, and typing-throttle logic is real and implemented, but entirely unverified by automated tests.

**Coverage Status**: 
- Pure backoff math: 4 tests (libs/contracts/src/lib/realtime.spec.ts)
- Server-side idempotency and isolation: tests 5.4/5.5 (conversation-gateway.integration.spec.ts)
- Frontend stores and services: **zero dedicated test files**

**Recommendation**: Dedicated follow-up change to build a proper `WebSocket` test harness for the three frontend real-time stores and widget service. This is real, non-trivial work with no existing pattern in the repo to follow.

### WARNING 2: Bundle Budgets Exceeded

**Status**: Non-blocking, already accepted during apply phase.

- `agent-console`: 529.07 kB (threshold: 500 kB, error limit: 1 MB)
- `widget`: 509.12 kB (threshold: 500 kB, error limit: 1 MB)

**Cause**: PrimeNG + Angular Router overhead; not investigated for reduction in this batch.  
**Recommendation**: Bundle optimization follow-up; not critical for this delivery.

---

## Architectural Notes

### Worker-in-Same-Process (Cost-Zero Constraint)

Consistent with `04-add-sla-jobs` (same repository decision #d1c07a9): no separate `apps/worker` exists. The Valkey pub/sub bus is real and correct (independent publish and subscribe connections verified in test 5.3 against real Valkey), ready for the day `apps/api` scales horizontally. Today, `SlaClockService.breach()` publishes directly to `RealtimeEventBusService` in the same process.

### Conversation-Ticket Bridge

`Conversation` (from `02-add-dual-auth`) and `Ticket`/`Message` (from `03-add-ticket-queue`) were never connected before this change. The widget's client-message idempotency required a real bridge: `Conversation.ticketId String? @unique`, created lazily on first widget message send. Pattern follows the same atomic-guard idiom (guarded `updateMany`) used elsewhere in `TicketsService.claimTicket` for race-safe concurrency.

### Agent REST Replies Not Broadcast Over WebSocket

Documented scope cut: `ConversationGateway.handleMessageSend` rejects non-widget senders with error `ONLY_WIDGET_CAN_SEND_HERE`. Agent replies continue via the REST endpoint `POST /tickets/:id/messages` (existing, pre-`03-add-ticket-queue`). Broadcasting agent REST replies to connected widget clients over `ws` is a natural, unambiguous follow-up, not blocked by this batch.

---

## Implementation Statistics

### Backend

- **Test Command**: `pnpm exec vitest run apps/api libs/db libs/contracts libs/sla-engine`
- **Results**: 41 files / 197 tests, all passing
  - Preexisting from changes 00-04: 174 tests
  - New in this batch: 23 tests
    - ws-auth.spec.ts: 8 tests
    - realtime-sse.integration.spec.ts: 2 tests
    - ws-heartbeat.integration.spec.ts: 2 tests
    - sla-breach-dashboard-event.integration.spec.ts: 1 test
    - conversation-gateway.integration.spec.ts: 6 tests
    - libs/contracts/src/lib/realtime.spec.ts: 4 tests
- **Linting & Build**: All green (package deps: `ws`, `@nestjs/websockets` added to `apps/api/package.json`)

### Frontend

- **Test Command**: `pnpm nx run-many -t test -p agent-console,widget --skip-nx-cache`
- **Results**: 4 files / 10 tests, all passing
  - apps/agent-console: 3 files / 9 tests (preexisting, no regressions after CRITICAL fix)
  - apps/widget: 1 file / 1 test (new, smoke test)
- **Linting & Build**: All green (bundle budget warnings noted above)

### Schema

- **Migration**: `20260829160231_add_realtime_conversation_ticket_bridge`
- **Changes**: `Conversation.ticketId String? @unique` added
- **Verification**: Prisma generate re-run in container before each test batch; idempotent on second run

---

## Source of Truth Updated

The realtime-hybrid domain is now part of the specification:
- **File**: `openspec/specs/realtime-hybrid/spec.md`
- **5 Requirements**: All covered by real, independently-reproduced passing tests
- **Ready for future changes**: This domain definition is authoritative for follow-ups (e.g., agent-message-send broadcast, frontend test coverage)

---

## SDD Cycle Complete

✅ **Proposal** — Intent and approach defined  
✅ **Spec** — 5 requirements documented  
✅ **Design** — Technical choices explained  
✅ **Tasks** — 42 implementation tasks, all completed  
✅ **Apply** — Implementation verified, CRITICAL bug fixed and re-verified  
✅ **Verify** — PASS verdict (with 2 non-blocking follow-ups)  
✅ **Archive** — Change closed, specs merged, audit trail preserved  

**Status**: Ready for next change.
