# Archive Report: Add Dual Authentication

**Change**: 02-add-dual-auth  
**Project**: pulsedesk  
**Archive Date**: 2026-08-27  
**Archived To**: `openspec/changes/archive/2026-08-27-02-add-dual-auth/`  
**Spec Synced To**: `openspec/specs/dual-auth/spec.md`

## Final State Authority

This report documents the state of the change AT CLOSE per the Final-State Authority hierarchy:

1. **Explicit Final-State Facts** (from launch prompt): Implementation pushed at HEAD `e82e4d8` (verify-report-only commit); verified live at commit `22171a9` (last code change, infra fixes); two non-blocking WARNINGs documented below; dependencies.archive = "ready".
2. **Persisted Artifacts**: All SDD artifacts present and verified; all 19 tasks checked complete in tasks.md.
3. **Verification Report** (Observation ID #45): PASS verdict, 0 CRITICAL, 0 blockers, 7/7 scenarios COMPLIANT, 4/4 requirements met. Tests: 68/68 (auth+widget scope), 82/82 (full apps/api scope). Coverage: apps/api/src/auth 100% stmts/97.67% branch/100% funcs/100% lines (≥95 threshold). Verdict: PASS.

## Change Summary

### Intent
Implement dual authentication: opaque session-based authentication for agents (with instant revocation) and scoped JWT tokens for widget conversations (ephemeral, single-conversation scope).

### Scope — In
- Agent sessions: opaque, httpOnly cookie, Valkey-backed, instant revocation
- Widget tokens: JWT-based, scoped to single conversation
- HTTP guards: `AgentSessionGuard`, `WidgetTokenGuard`, `RoleGuard`
- Rate limiting on login and widget conversation creation

### Scope — Out
- SSE/WebSocket guard propagation (Phase 5)
- OAuth / SSO (MVP only supports email+password)

## Implementation Status

**Location**: apps/api/src/auth/**, apps/api/src/widget/**  
**Database**: libs/db/prisma/schema/{agent,widget}.prisma  
**Completed**: Yes — all 19 tasks checked complete

### Task Summary (19/19 complete)

**1. Esquema** (2/2)
- Agent model in Prisma with email (citext), passwordHash, role, availability, maxCapacity, isActive
- PublicAgent type (select without passwordHash) + lint rule enforcement

**2. Sesiones de agente** (5/5)
- POST /auth/login: Argon2 password verification, opaque session token via Valkey
- httpOnly/Secure/SameSite=Strict cookie implementation
- POST /auth/logout: Valkey key revocation
- AgentSessionGuard: validates session against Valkey, injects PublicAgent
- Administrative deactivate endpoint: instant session revocation via SessionsService.revokeAllSessions

**3. Token de widget** (2/2)
- POST /widget/conversations: customer/conversation upsert, JWT issuance (4h TTL)
- WidgetTokenGuard: JWT verification + conversationId scoping

**4. Autorización** (2/2)
- RoleGuard for agent/supervisor/admin roles
- Rate limiting: login (5/60s per IP), widget (10/60s per IP/session)

**5. Tests** (4/4 + 2 Definición de terminado)
- 5.1: Session revocation invalidates NEXT request (not current) — agent-session.guard.spec.ts
- 5.2: Widget token rejected outside its conversation — widget-token.guard.spec.ts
- 5.3: Invalid credentials don't reveal if email exists — auth.service.spec.ts (non-enumeration)
- 5.4: Route guard enumeration audit — route-guard-enumeration.spec.ts
- Done: apps/api/src/auth coverage ≥95% — **Actual: 100% statements, 97.67% branch**
- Done: Agent deactivation revokes session in next request — deactivation-revokes-sessions.spec.ts

## Verification Results

**Verify Report Observation ID**: #45  
**Verdict**: **PASS**  
**Evidence Revision**: sha256:22171a9a505a9642bf4b6cb50dabacdd50281ca5

### Compliance Matrix (7/7 Scenarios)

| Scenario | Test Evidence | Status |
|----------|---------------|--------|
| Autenticacion de agentes / Login exitoso | auth.controller.spec.ts + auth.service.spec.ts | ✅ COMPLIANT |
| Autenticacion de agentes / Credenciales invalidas (non-enumeration) | auth.service.spec.ts | ✅ COMPLIANT |
| Revocacion instantanea / Desactivar agente | deactivation-revokes-sessions.spec.ts + agent-session.guard.spec.ts | ✅ COMPLIANT |
| Revocacion instantanea / Logout revoca sesion | auth.controller.spec.ts + auth.service.spec.ts | ✅ COMPLIANT |
| Token de widget / Token valido para su conversacion | widget-token.guard.spec.ts | ✅ COMPLIANT |
| Token de widget / Token rechazado fuera de su conversacion | widget-token.guard.spec.ts (5.2) | ✅ COMPLIANT |
| Separacion de guards / Cobertura completa | route-guard-enumeration.spec.ts | ✅ COMPLIANT |

### Test Results

- **Scoped (auth+widget)**: 68 tests, all passing
- **Full apps/api**: 82 tests, 18 files, all passing
- **Coverage**: apps/api/src/auth 100%/97.67%/100%/100% (stmts/branch/funcs/lines) — **exceeds 95% threshold**
- **Coverage**: apps/api/src/widget 100%/100%/100% across 4 files
- **Build**: pnpm nx run-many -t lint test build --all — **PASS across 7 projects**

### Post-Implementation Fixes (Documented)

Per launch prompt: two post-implementation infrastructure fixes landed before production:

1. **Commit 22171a9** (Dockerfile + webpack.config.js): Fixed argon2 native binding issue. Problem: pnpm workspace hoisting; argon2 native-addon-build failed in Docker's alpine image without development tools. Solution: explicit webpack externals + switched base image from node:24-alpine to node:24-slim (includes glibc).

2. **Render Dashboard**: User added `WIDGET_JWT_SECRET` env var to Render dashboard for widget token signing in production.

**Live Verification**: `/health` endpoint confirms commit 22171a9-adjacent (e82e4d8 only added verify-report doc, no code change, so deploy-backend was correctly skipped/unaffected).

## Issues and Warnings

**CRITICAL**: None

**WARNING (1)** — *WidgetTokenGuard conversationId check conditional on route param*  
Per verify-report observation #45: WidgetTokenGuard's conversationId check is conditional on the route param being present. Safe today (only route using it always provides the param, route-guard-enumeration.spec.ts would catch a missing guard), but no structural guarantee against future routes lacking the param. Independent security review flagged as non-exploitable. **Recommendation**: Harden guard or extend route-guard-enumeration.spec.ts. **Carry forward as follow-up** — not a blocker for archive.

**WARNING (2)** — *Change size exceeds 400-line PR review budget*  
Per verify-report observation #45: Change shipped as one 56-file commit with +2475-47 lines, well above the 400-line standard review budget. Plus two post-hoc infra fixes before prod was healthy. Already merged/live. **Process note for future sdd-tasks chaining**, not a code defect.

**SUGGESTION (1)** — Pre-existing: nx run db:typecheck fails in libs/db/src/lib/valkey.provider.ts (TS2709/TS2351) due to ioredis typing under moduleResolution: nodenext. Confirmed pre-existing via git stash. Unrelated to this change.

**SUGGESTION (2)** — Pre-existing: apps/api/src/health and libs/db low coverage in scoped test run is expected (out of scope).

## Specs Synced

| Domain | Source | Action | Details |
|--------|--------|--------|---------|
| dual-auth | `openspec/changes/02-add-dual-auth/specs/dual-auth/spec.md` | Created | 4 requirements, 7 scenarios. Mechanical copy verified via empty diff readback. |

**Verification**: Spec copy from delta to main specs via mechanical shell copy with empty `diff -r` readback.

## Archive Contents

Archived to `openspec/changes/archive/2026-08-27-02-add-dual-auth/`:

- ✅ proposal.md — Change intent and scope
- ✅ design.md — Technical architecture and risk mitigations
- ✅ specs/dual-auth/spec.md — Requirements and scenarios (same as main spec)
- ✅ tasks.md — 19 tasks, all checked complete
- ✅ verify-report.md — Full verification report (mirrors Engram observation #45)

**Verification**: Mechanical copy with empty `diff -r` readback confirming archive integrity.

## Artifact Observation IDs (Engram Traceability)

- `sdd/02-add-dual-auth/verify-report` — Observation ID #45

Note: proposal, spec, design, and tasks exist only in openspec/files; no separate Engram observations for those artifacts in this cycle (hybrid mode prioritizes openspec as source of truth for SDD docs).

## Source of Truth Updated

The following specs now describe the final, shipped behavior:

- **`openspec/specs/dual-auth/spec.md`** — Dual authentication requirements and scenarios. Replaces the previous unspecified auth; now codified for future phases (e.g., Phase 5 SSE/WebSocket guard propagation will reference this).

## SDD Cycle Complete

The change has been fully planned (proposal), specified (4 requirements, 7 scenarios), designed (architecture doc), implemented (19 tasks), verified (PASS, 0 CRITICAL, 7/7 compliant), and archived. The cycle is closed.

**Next Phase**: Ready for the next SDD change. Carry forward the two non-blocking WARNINGs as context for follow-up work.

---

**Session**: sdd-archive executor  
**Skill Resolution**: paths-injected (`sdd-archive/SKILL.md`, `_shared/sdd-phase-common.md`)  
**Archived**: 2026-08-27
