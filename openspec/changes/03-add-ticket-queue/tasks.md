# Tasks: Add Ticket Queue

## 1. Esquema
- [x] 1.1 Modelos `Customer`, `Ticket`, `Message`, `TicketEvent`, `SlaPolicy` en Prisma — `Customer` ya existía (02-add-dual-auth); se le añadió la relación inversa `tickets Ticket[]`. `Ticket`, `Message`, `TicketEvent`, `SlaPolicy` nuevos en `libs/db/prisma/schema/ticket.prisma`; `Agent` recibió las relaciones inversas `assignedTickets`/`authoredMessages`/`ticketEvents`.
- [x] 1.2 Índices: parcial de cola (`assigneeId IS NULL AND status = 'NEW'`, hand-added — ver 1.4), `@@index([assigneeId, status])`, `@@index([customerId])` en `ticket.prisma`. Existencia verificada contra el catálogo real de Postgres (ver Definición de terminado).
- [x] 1.3 `@@unique([ticketId, clientMessageId])` en `Message` — presente en `ticket.prisma`, migrado como `Message_ticketId_clientMessageId_key`.
- [x] 1.4 Migración `libs/db/prisma/migrations/20260827200842_add_ticket_queue/` generada con `prisma migrate dev --create-only` dentro de un contenedor Linux unido a la red de `docker compose` (mismo workaround P1000-Windows de 02-add-dual-auth), con el `CREATE INDEX ... WHERE "assigneeId" IS NULL AND "status" = 'NEW'` añadido a mano al `migration.sql` generado. Aplicada dos veces con `prisma migrate deploy` (misma imagen, red de compose) — segunda vez confirma "No pending migrations to apply" (idempotencia).

## 2. Dominio
- [x] 2.1 Máquina de estados explícita en `apps/api/src/tickets/ticket-state-machine.ts` (mapa de adyacencia `NEW→OPEN→{PENDING,RESOLVED}→...`, con reapertura desde `RESOLVED`/`CLOSED` a `OPEN`). Cobertura completa de la matriz en `ticket-state-machine.spec.ts` (9 tests: cada transición válida + "todo lo demás se rechaza").
- [x] 2.2 `POST /tickets`, `GET /tickets` (filtros status/priority/assigneeId + paginación), `GET /tickets/:id` — `apps/api/src/tickets/tickets.controller.ts` + `tickets.service.ts`.
- [x] 2.3 `POST /tickets/:id/claim` — `TicketsService.claimTicket`, `updateMany({ where: { id, assigneeId: null } })` condicional exacto de design.md; re-lectura tras confirmar (Prisma `updateMany` no soporta `RETURNING`).
- [x] 2.4 `PATCH /tickets/:id/status` — `TicketsService.updateStatus`, valida con `assertValidTransition` antes de escribir (transición inválida no toca la fila).
- [x] 2.5 `POST /tickets/:id/messages` (agente, `visibility: PUBLIC|INTERNAL`) + `GET /tickets/:id` filtra notas internas en el `WHERE` de Prisma según el solicitante (agente ve todo vía `TicketsService.getTicketForAgent`; cliente autenticado por widget token ve solo público vía `getTicketForCustomer`). Acceso dual agente/cliente resuelto por `TicketRequesterGuard` (compone `AgentSessionGuard` y `WidgetTokenGuard` existentes). **Fix de seguridad post-implementación**: una revisión de seguridad encontró que `WidgetTokenGuard` reusado en `GET /tickets/:id` (ruta sin `:conversationId`, solo `:id` de ticket) hacía que su chequeo de alcance por conversación quedara silenciosamente deshabilitado — un token de widget de *cualquier* conversación de un cliente podía leer *cualquier* ticket de ese mismo `customerId`, contradiciendo el contrato documentado de `WidgetTokenPayload` ("nunca conversación B con token de A"). Corregido: `WidgetTokenGuard` ahora falla cerrado por defecto en rutas sin `:conversationId`, salvo marca explícita `@WidgetCustomerScoped()` (nuevo decorator) — aplicado a esta ruta como decisión intencional y documentada (el ticket es del cliente, no de una conversación puntual; el alcance por `customerId` viene del JWT firmado, nunca de input del cliente). Tests nuevos en `widget-token.guard.spec.ts` prueban ambos caminos (falla cerrado sin marca; autoriza por `customerId` con marca). Verificado con `pnpm nx run-many -t lint test build --all` (7/7 verde) + suite de integración contra Postgres real vía contenedor Linux (8/8, incluye los tests de este cambio).

## 3. Consultas de agregación (`libs/db/src/queries/`)
- [x] 3.1 `getDashboardSnapshot` (`dashboard-snapshot.query.ts`): conteos por estado vía `COUNT(*) FILTER`, percentiles P50/P90 de primera respuesta vía `PERCENTILE_CONT`, tickets en riesgo (80% de `SlaPolicy.resolutionMinutes` consumido, calculado al vuelo ya que `SlaClock` no corre todavía).
- [x] 3.2 `getAgentLoad` (`agent-load.query.ts`): carga activa por agente con `RANK() OVER (ORDER BY ... DESC)`.
- [x] 3.3 Interfaces `DashboardSnapshot`/`AgentLoad` declaradas a mano; test de integración `libs/db/src/queries/raw-queries.integration.spec.ts` verifica la forma real contra Postgres real (tipos `number`, no `bigint`/`string`).
- [x] 3.4 `bigIntToNumber` en `libs/db/src/queries/bigint.ts`, usado por ambas consultas antes de retornar.

## 4. Frontend (sin tiempo real todavía)
- [ ] 4.1 Tabla de tickets con PrimeNG: filtros, orden, paginación (recarga manual, sin push)
- [ ] 4.2 Vista de detalle de ticket con hilo de mensajes y notas internas
- [ ] 4.3 Envolver los componentes de PrimeNG usados en `libs/ui`

## 5. Tests
- [x] 5.1 `apps/api/src/tickets/tickets.integration.spec.ts` — dos agentes reclamando el mismo ticket vía `Promise.allSettled` contra el `TicketsService.claimTicket` real (Postgres real, no mock): exactamente uno cumple, el otro rechaza con `ConflictException`; se verifica además que la fila persistida coincide con el ganador. Test adicional: reclamar un ticket ya asignado se rechaza sin tocar la asignación existente.
- [x] 5.2 `tickets.integration.spec.ts`: `new → closed` rechazado con `UnprocessableEntityException`, releído de Postgres para confirmar que el estado sigue en `NEW`. Matriz completa (todas las transiciones válidas/ inválidas) cubierta además por `ticket-state-machine.spec.ts` (unitario, puro).
- [x] 5.3 `tickets.integration.spec.ts`: se crean una nota pública y una interna reales; `TicketsService.getTicketForCustomer` (la respuesta real de servicio detrás de `GET /tickets/:id` para un cliente) devuelve solo el mensaje público; `getTicketForAgent` devuelve ambos. Prueba la respuesta real, no la consulta en aislamiento.
- [x] 5.4 `tickets.integration.spec.ts`: `Object.values(TicketPriority)` verificado como `['LOW','NORMAL','HIGH','URGENT']` (detecta un reordenamiento silencioso del enum) + escenario exacto del spec (creados normal→urgent→low, la cola real devuelve urgent→normal→low).
- [x] 5.5 `libs/db/src/queries/raw-queries.integration.spec.ts` — `getDashboardSnapshot` y `getAgentLoad` contra Postgres real, verificando que cada campo es `number` (prueba que `bigIntToNumber` corrió de verdad; un Prisma mockeado no lo demostraría).

## Definición de terminado
- [ ] Un agente gestiona un ticket de principio a fin (crear → reclamar → responder → resolver → cerrar) refrescando la página manualmente — pendiente de Batch 2 (frontend, sección 4)
- [x] El índice parcial de cola existe tras aplicar las migraciones (verificado por test, no solo por inspección) — `libs/db/src/queries/ticket-queue-index.integration.spec.ts` consulta `pg_indexes` real y verifica `indexdef` (WHERE clause + orden de columnas). Confirmado también manualmente vía `psql`: `Ticket_unassigned_queue_idx | CREATE INDEX ... ON public."Ticket" USING btree (priority DESC, "createdAt") WHERE (("assigneeId" IS NULL) AND (status = 'NEW'::"TicketStatus"))`.

## Nota de alcance (Batch 1/2)
Este cambio se implementó en dos lotes. **Batch 1 (este)**: backend completo — secciones 1, 2, 3 y tests 5.1-5.5, más el ítem del índice parcial en "Definición de terminado". **Batch 2 (pendiente)**: sección 4 (frontend: tabla de tickets en `apps/agent-console` con PrimeNG, vista de detalle, wrappers en `libs/ui`) y el ítem restante de "Definición de terminado" (flujo end-to-end de un agente en la UI).
