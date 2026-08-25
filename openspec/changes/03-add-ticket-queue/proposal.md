# Proposal: Add Ticket Queue

## Intent
Antes de meter WebSockets, SSE o BullMQ en la ecuación, el dominio de tickets tiene que funcionar por REST puro: crear, listar, filtrar, asignar y cerrar. Esto aísla los bugs de modelo de datos y de concurrencia de asignación de los bugs de transporte en tiempo real — si algo falla después, sabemos que no es el dominio.

## Scope

**In scope**
- Modelo de datos: `Customer`, `Ticket`, `Message`, `TicketEvent`, `SlaPolicy` (sin `SlaClock` activo todavía — eso es la Fase 4).
- CRUD de tickets vía REST: crear, listar con filtros, obtener detalle, cambiar estado.
- Máquina de estados del ticket (new → open → pending → resolved → closed, con reapertura).
- Asignación atómica de tickets a agentes (resolución de condición de carrera).
- Notas internas (visibles solo para agentes, nunca para el cliente).
- Consultas de métricas del dashboard con agregaciones SQL.
- Tabla de tickets en la consola de agentes con PrimeNG (filtros, orden, paginación) — sin actualización en vivo todavía.

**Out of scope**
- Cualquier evento en tiempo real (Fase 5).
- Vencimiento automático de SLA (Fase 4) — la política se asocia al ticket, pero el reloj no corre todavía.
- Auto-asignación (Fase 4, requiere BullMQ).

## Approach
REST estándar de NestJS + Prisma sobre lo construido en `add-dual-auth`. La pieza no trivial es la asignación: dos agentes reclamando el mismo ticket sin asignar es una condición de carrera real, resuelta con una única sentencia SQL condicional (`updateMany` con `assigneeId: null` en el `where`) en lugar de leer-decidir-escribir con bloqueo.
