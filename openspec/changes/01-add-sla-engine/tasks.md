# Tasks: Add SLA Engine

## 1. Modelo de calendario
- [x] 1.1 Definir `BusinessCalendar` (franjas por día, festivos, timezone IANA) — `libs/sla-engine/src/lib/business-calendar.ts`
- [x] 1.2 Validación de forma del calendario (franjas no solapadas, `from < to`) — `validateBusinessCalendar()`, tested in `business-calendar.spec.ts` (6 tests: valid calendar, invalid timezone, malformed time, `from >= to`, non-overlapping split windows, overlapping windows)

## 2. Funciones puras
- [x] 2.1 `addBusinessMinutes(from, minutes, calendar)` con enfoque de saltos de ventana — `libs/sla-engine/src/lib/sla-engine.ts`, window-jump loop bounded by windows crossed (verified: 9 loop iterations for a 4500-minute SLA in test 3.8, not 4500)
- [x] 2.2 `businessMinutesBetween(a, b, calendar)` — same file, same window-jump approach
- [x] 2.3 Manejo de zonas horarias vía librería de fechas con soporte IANA (no aritmética manual) — added `luxon` (`^3.7.2`) as `libs/sla-engine`'s only runtime dependency; no library existed in the workspace beforehand (checked `package.json`/`pnpm-lock.yaml` first, per convention)
- [x] 2.4 Manejo de cambio de horario de verano — all window boundaries computed via `DateTime#set()`/`#plus()` in the calendar's IANA zone, never via raw millisecond arithmetic; covered by test 3.6

## 3. Tests (cobertura de ramas 100% — no negociable, ver `project.md`)
- [x] 3.1 Vencimiento dentro de la misma jornada laboral — `sla-engine.spec.ts`: "3.1 lands within the same business day..."
- [x] 3.2 Vencimiento que cruza la noche (fuera de horario) — "3.2 rolls the due date past the night..."
- [x] 3.3 Vencimiento que cruza el fin de semana — "3.3 rolls the due date past the weekend..." (see Risks note below — corrected an arithmetic inconsistency found in `spec.md`'s own example)
- [x] 3.4 Ticket abierto en festivo — "3.4 skips a holiday entirely..."
- [x] 3.5 Ticket abierto fuera de horario (antes de apertura / después de cierre) — "3.5 starts the SLA clock at the next opening time..." (both sub-cases asserted in one test)
- [x] 3.6 Cambio de horario de verano dentro de la ventana de cálculo — "3.6 keeps correct wall-clock hours across a DST transition..." (Europe/Madrid, Fri 27 Mar → Mon 30 Mar 2026, crossing the CET→CEST transition)
- [x] 3.7 SLA de 0 minutos — "3.7 resolves a 0-minute SLA to the current instant..." (in-hours and out-of-hours sub-cases)
- [x] 3.8 SLA mayor que una semana laboral completa — "3.8 computes a due date correctly for an SLA longer than a full business week" (4500 minutes, hand-verified in a code comment, 9 window jumps)
- [x] 3.9 Caso manual de verificación: viernes 17:50 + SLA 4h laborables + jornada 9-18 → debe vencer el lunes a las 12:50 (documentar el cálculo a mano en el test como comentario) — "3.9 matches the manual calculation..." with the by-hand math in a comment

Additional tests beyond the 9 required above (for full branch/statement/function coverage and defensive robustness): calendar-empty-of-windows error path, negative-minutes guard, multi-window/lunch-break same-day gap, and a dedicated `businessMinutesBetween` describe block (5 tests) mirroring `spec.md`'s first requirement's scenarios.

## Definición de terminado
- [x] `libs/sla-engine` no importa nada fuera de una librería de fechas — cero dependencias de Prisma, HTTP o BullMQ (verified via `grep -i "prisma|bullmq|fastify|nestjs|http"` over `libs/sla-engine/src` — no matches; `libs/sla-engine/package.json` declares only `luxon` as a dependency; `@nx/enforce-module-boundaries`'s `type:util` → `onlyDependOnLibsWithTags: []` constraint left untouched)
- [x] Cobertura de ramas 100% en `nx test sla-engine --coverage` — actual result: **Statements 100% (81/81), Branches 100% (36/36), Functions 100% (17/17), Lines 100% (76/76)**, 23 tests across 2 spec files, 0 failures
- [x] Los 9 casos de la sección 3 están como tests con nombres descriptivos, no como un único test paramétrico opaco — confirmed above
