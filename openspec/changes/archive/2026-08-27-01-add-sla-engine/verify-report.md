# Verification Report: 01-add-sla-engine

**Verdict**: PASS WITH WARNINGS
**Date**: 2026-08-27
**HEAD**: `08a47d5` (matches `origin/main`, working tree clean)

## Completeness

| Task | Status | Evidence |
|---|---|---|
| 1.1 `BusinessCalendar` model | Complete | `business-calendar.ts:6-29` |
| 1.2 Calendar shape validation | Complete | `validateBusinessCalendar()`, 6 tests in `business-calendar.spec.ts` |
| 2.1 `addBusinessMinutes` window-jump | Complete | `sla-engine.ts:79-109`; 9-iteration trace hand-verified (see below) |
| 2.2 `businessMinutesBetween` | Complete | `sla-engine.ts:116-138` |
| 2.3 Luxon IANA timezone support | Complete | `libs/sla-engine/package.json` declares `luxon@^3.7.2` as sole dependency |
| 2.4 DST handling | Complete | wall-clock arithmetic via `DateTime#set()`/`#plus()`, test 3.6 |
| 3.1-3.9 named tests | Complete | all 9 present as separately-named `it(...)` blocks (grep-confirmed) |
| DoD: zero Prisma/HTTP/BullMQ deps | Complete | grep across `package.json`/`project.json`/`src` -- zero matches |
| DoD: 100% branch coverage | Complete | genuinely re-run, see Coverage below |
| DoD: 9 named tests, not parametrized | Complete | confirmed |

18/18 tasks checked and independently confirmed against code state.

## Spec Compliance Matrix (post-fix spec.md, HEAD `08a47d5`)

| Requirement | Scenario | Status | Covering test |
|---|---|---|---|
| R1 Minutos laborables entre instantes | Misma jornada | PASS | `businessMinutesBetween` "counts elapsed... same business day" (120 min) |
| R1 | Abarca una noche | PASS | "stops counting at closing time..." (60 min) |
| R1 | Abarca fin de semana | PASS | "excludes the weekend entirely..." (60 min) |
| R1 | Abarca un festivo | PASS | "excludes a holiday even when it falls on..." (60 min) |
| R2 Suma de minutos laborables | No cruza fin de jornada | PASS | 3.1 (equivalent scenario, different numbers: 120min not 30min, same shape) |
| R2 | Cruza fin de semana | PASS | 3.3, exact numbers, hand-verified independently |
| R2 | Inicio fuera de horario | PASS | 3.5 `afterClosing` (equivalent, 20:00/30min vs spec 22:00/60min) |
| R2 | SLA 0 min dentro de horario | PASS | 3.7 `withinHours`, exact match |
| R2 | SLA 0 min fuera de horario | PASS | 3.7 `outsideHours` (equivalent, 20:00 vs spec 22:00) |
| R3 Zonas horarias / DST | Cruce a horario de verano | PASS | 3.6, exact match, hand-verified independently (Europe/Madrid CET to CEST) |
| R4 SLA de larga duracion | SLA de dos semanas laborables | PASS | 3.8, exact match (4500 min), hand-verified due date AND O(windows) iteration count |

11/11 scenarios compliant. All covering tests pass at runtime (23/23 green).

## Independent Hand Verification (not trusting the code own tests)

1. Friday 17:00 + 240min crossing weekend (test 3.3): 2026-01-09 is Friday (Jan 1 2026 = Thursday, +8 days = Friday). Fri 17:00 to 18:00 = 60 min. Remaining 180 min. Monday 2026-01-12 opens 09:00, +180min = 12:00. Result: 2026-01-12T12:00:00.000Z. Matches code output and matches the corrected spec.md number.

2. DST case (test 3.6): EU spring-forward 2026 falls on the last Sunday of March = 2026-03-29 (March 1 2026 = Sunday; Sundays fall on 1, 8, 15, 22, 29). Friday 2026-03-27 17:00 CET (UTC+1) to 18:00 = 60 min consumed (still CET, pre-transition). Remaining 180 min. Monday 2026-03-30 09:00 is already CEST (UTC+2); 09:00+180min = 12:00 local = 10:00Z. Matches code output (2026-03-30T10:00:00.000Z) and the wall-clock assertion (12:00 local). A naive UTC-offset-fixed implementation would have produced 11:00Z; Luxon zone-aware arithmetic correctly avoids that.

3. More than 1-week SLA, 4500 minutes (test 3.8): 540 business min/day, Mon-Fri. Monday 2026-01-05 09:00 start (Jan 5 = Monday, verified). Mon-Fri (5x540=2700) exhausts week 1, landing Fri 2026-01-09 18:00, next window Mon 2026-01-12 09:00. Remaining 4500-2700=1800. Mon+Tue+Wed (3x540=1620) leaves 180, consumed Thu 2026-01-15 09:00 to 12:00 (Jan 15 = Thursday, verified: Jan 1 Thu +14 days = Thu). Result: 2026-01-15T12:00:00.000Z. Matches.
   Additionally hand-traced the addBusinessMinutes while-loop for this exact case: iterations = Mon(5) -> Tue(6) -> Wed(7) -> Thu(8) -> Fri(9) -> Mon(12) -> Tue(13) -> Wed(14) -> Thu(15, partial) = 9 iterations, confirming the O(windows-crossed) claim (not O(4500)) independently of the code own comment.

## Coverage Evidence (freshly re-run, --skip-nx-cache)

```
pnpm nx test sla-engine --coverage --skip-nx-cache
 Test Files  2 passed (2)
      Tests  23 passed (23)
Statements   : 100% ( 81/81 )
Branches     : 100% ( 36/36 )
Functions    : 100% ( 17/17 )
Lines        : 100% ( 76/76 )
```
Genuine 100% branch coverage confirmed (36/36), not merely claimed. 23 tests across sla-engine.spec.ts (17) and business-calendar.spec.ts (6), matching tasks.md own count.

## Isolation / Module Boundaries

- libs/sla-engine/package.json: only dependency is luxon@^3.7.2. No Prisma/HTTP/BullMQ/Fastify/Nest/Express/Axios anywhere in package.json, project.json, or src/ (grep, zero matches).
- libs/sla-engine/project.json tags: ["scope:shared", "type:util"] -- byte-identical to the tags set at bootstrap (a76ca2a); only the targets.test block was added in 3412bf6.
- eslint.config.mjs: type:util -> onlyDependOnLibsWithTags: [] constraint confirmed unchanged and still applies to sla-engine.

## Full Workspace Regression Check

pnpm nx run-many -t lint test build --all -- all 7 projects (agent-console, widget, api, ui, contracts, sla-engine, db) succeeded: lint clean, all test suites green (contracts 6/6, sla-engine 23/23, api 14/14), all builds succeeded. No regressions.

## CI Independent Confirmation

- Run 33086297664 (workflow "CI"): headSha = 08a47d50cf624b0668fef62e0d68bbff8c45dd25 (matches this change HEAD exactly), conclusion: success. lint-and-test job step list independently confirmed via gh run view --json jobs: "Apply migrations (proves citext extension applies cleanly)" and "Re-apply migrations (proves idempotency on re-run)" both conclusion: success. This substantiates the claim that migrate-deploy has now been exercised successfully by a real triggered CI run -- resolves the outstanding WARNING follow-up left open by 00-bootstrap-monorepo verify report (noted here as context only; not this change own spec).
- Run 33086297700 (workflow "Release"): same headSha, conclusion: success, jobs affected/deploy-widget/deploy-agent-console/deploy-backend all success.

## Issues

### CRITICAL
None.

### WARNING
1. Spec edits in 3412bf6 are broader than the commit message states. The commit message says it "fixes 3 arithmetic typos (off-by-one-hour)" in the frozen spec. Independent diff review (git diff e61ed2e 3412bf6 -- specs/sla-engine/spec.md) shows only 1 of the 3 edits is a genuine single-number arithmetic fix ("13:00 del lunes" -> "12:00 del lunes", Suma que cruza el fin de semana). The other 2 edits change the scenario WHEN input instant itself, not just the output number: "las 10:00 del martes/lunes" -> "las 08:00 del martes/lunes (antes de apertura)" in the "Instantes que abarcan una noche" and "...un fin de semana" scenarios. Hand-check: the original wording (b=10:00, i.e. one hour past opening) implies 120 correct business minutes, not the 60 the original THEN clause stated -- a genuine logic inconsistency in the original scenario, not a simple off-by-one on a stated result. Changing the GIVEN/WHEN precondition to 08:00 (before opening) is how the fix restores internal consistency, but that is a different and larger class of edit than "arithmetic typo." Net effect: the current spec.md is now internally consistent and matches the implementation and tests exactly (verified above), so this is not a functional defect -- but a "frozen" spec was edited unilaterally during the apply commit, and the commit message understates the scope of that edit, which bypasses the intended spec-review checkpoint. Recommend, for future changes: route any spec-scenario-precondition correction (not just corrected output numbers) back through spec review rather than folding it silently into the implementation commit.

### SUGGESTION
1. Two of the eleven scenario mappings (R2 "Inicio fuera de horario laboral" and R2 "SLA 0 min fuera de horario") are tested with different clock values than spec.md literal examples (20:00/30min vs spec 22:00/60min). Behaviorally equivalent and correctly passing, but a literal byte-for-byte match to spec.md stated numbers would make the spec-to-test traceability easier to audit at a glance in future changes.

## Final Verdict

PASS WITH WARNINGS -- 0 CRITICAL, 1 WARNING, 1 SUGGESTION. All 18 tasks complete and independently confirmed against code state; all 11 spec scenarios compliant with passing runtime tests; 100% branch coverage genuinely re-verified (36/36); zero Prisma/HTTP/BullMQ leakage into a pure library; module boundary tags unchanged; full workspace lint/test/build shows no regressions; both cited CI runs independently confirmed green with the claimed steps present. The single WARNING is about commit-message precision on a spec correction, not a functional gap -- implementation is correct and spec/test/code are now mutually consistent.
