# SDD Archive Report: 04-add-sla-jobs

**Date**: 2026-08-29
**Status**: COMPLETE
**Change**: 04-add-sla-jobs

## Executive Summary

Change `04-add-sla-jobs` is fully implemented, verified, and archived. All 20 checklist items (18 numbered tasks + 2 Definición de terminado items) are complete and independently verified. The specification has been synced to `openspec/specs/sla-jobs/spec.md`, and the change folder has been moved to `openspec/changes/archive/2026-08-29-04-add-sla-jobs/`.

## Final State

Both implementation commits are on `main`:
- `1012a63`: feat(sla): add SLA clocks, BullMQ jobs, and round-robin assignment (batch 1: schema, BullMQ queues, pause/resume/complete/breach, consumers, sweep, round-robin — 39/40 tasks, 1 Definición de terminado deliberately left open pending a product decision)
- `4825335`: feat(sla): attach SlaPolicy to tickets and wire pause/resume/reactivate (batch 2: closes the remaining Definición de terminado item per the user's explicit product decision; includes a bug fix found during re-verification — `SlaClockService.complete()` was not folding elapsed active time into `consumedMinutes`, which would have made `reactivate()` recompute nearly the full original SLA budget on ticket reopen instead of the correct remaining time)

Working tree clean on `main` at `4825335`. Verdict: **PASS**.

## Artifacts

- Change folder archived to `openspec/changes/archive/2026-08-29-04-add-sla-jobs/` (proposal.md, design.md, specs/sla-jobs/spec.md, tasks.md, verify-report.md)
- Spec synced to `openspec/specs/sla-jobs/spec.md` (new file, 6 requirements, 8 scenarios)
- Engram: `sdd/04-add-sla-jobs/apply-progress` (#55), `sdd/04-add-sla-jobs/verify-report` (#57, 19/20 snapshot superseded by the report's own Addendum), `sdd/04-add-sla-jobs/archive-report` (#61)

## Verification Summary

- Tests: 35 files / 174 tests, all passing (6/6 requirements, 8/8 scenarios; 0 CRITICAL)
- Lint/build: clean, `compiler: tsc` real typecheck
- Migrations: `20260829125842_add_sla_jobs`, `20260829144112_add_sla_policy_priority`, `20260829144200_seed_sla_policies` — all applied and confirmed idempotent

## Issues and Warnings

**CRITICAL**: None.

**WARNING** (non-blocking, follow-up recommended): `proposal.md`/`design.md` still describe a literal two-process ("api schedules, worker executes") topology. `apps/worker` doesn't exist in this repo — folded into `apps/api` by pre-existing commit `d1c07a9` (Aug 27, before this change), for cost-zero hosting reasons. The adaptation is real, documented in `tasks.md`'s Nota de arquitectura, and the distributed-systems properties the spec cares about (idempotent job execution, crash recovery via `sla:sweep`, optimistic-lock version conflicts) are genuinely test-proven independent of process topology — but the canonical spec docs were never updated to match. Recommend a small doc-only follow-up.

**SUGGESTIONS**: (1) a standalone single-cycle pause/resume assertion would make that scenario's compliance self-evident without relying on the aggregate 3-cycle test; (2) a short comment in `ticket.prisma` noting `SlaPolicy` was scaffolded ahead of this change would help future readers.

## SDD Cycle Completion

Proposal → Spec → Design → Tasks → Apply (2 batches) → Verify (PASS, 1 non-blocking WARNING) → Archive. Complete.
