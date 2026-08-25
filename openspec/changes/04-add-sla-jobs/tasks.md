# Tasks: Add SLA Jobs

## 1. Esquema y repositorio
- [ ] 1.1 Modelo `SlaClock` en Prisma con columna `version` (int, default 0)
- [ ] 1.2 `BusinessCalendar` en Prisma (franjas, festivos, timezone) — persistencia del tipo que consume `libs/sla-engine`
- [ ] 1.3 `SlaClockRepository.update()` con guarda de versión manual (ver `design.md`)
- [ ] 1.4 Índice `sla_clocks_due_idx` parcial (`WHERE completed_at IS NULL AND paused_at IS NULL`)

## 2. Colas BullMQ
- [ ] 2.1 Colas `sla`, `assignment`, `maintenance` sobre Valkey
- [ ] 2.2 Programación de vencimiento con `jobId` determinista al crear/reanudar un reloj
- [ ] 2.3 Cancelación del trabajo programado al pausar o completar el reloj

## 3. Pausa y reanudación
- [ ] 3.1 `pause(ticketId)`: calcula minutos consumidos con `businessMinutesBetween` (Fase 1), guarda `consumedMinutes`, cancela el trabajo
- [ ] 3.2 `resume(ticketId)`: calcula minutos restantes, recalcula `dueAt` con `addBusinessMinutes` (Fase 1), reprograma el trabajo
- [ ] 3.3 `complete(ticketId, kind)`: idempotente por comprobación de `completedAt` antes de actuar

## 4. Consumidores
- [ ] 4.1 Consumidor de `sla`: relee el reloj, si sigue activo marca `breachedAt` y encola escalado
- [ ] 4.2 Consumidor de `assignment`: round-robin por carga relativa a capacidad
- [ ] 4.3 Trabajo repetible `sla:sweep` (cada 5 min): recupera relojes vencidos no procesados
- [ ] 4.4 Latido del worker: escribe timestamp en Valkey cada 15s (ya expuesto en `/health` desde la Fase 0)

## 5. Tests (la sección más importante de este cambio)
- [ ] 5.1 Un trabajo de vencimiento ejecutado dos veces produce un solo efecto (idempotencia)
- [ ] 5.2 Pausar y reanudar un reloj tres veces conserva el tiempo restante correcto
- [ ] 5.3 Cancelar un vencimiento programado al resolver el ticket antes de tiempo — el trabajo no se ejecuta
- [ ] 5.4 Conflicto de versión: dos actualizaciones concurrentes al mismo reloj — una gana, la otra recibe `SlaClockConflictException`
- [ ] 5.5 El barrido recupera un vencimiento simulando que el worker estuvo caído (reloj vencido, sin trabajo activo en la cola)
- [ ] 5.6 Round-robin no asigna a un agente que ya está en su capacidad máxima
- [ ] 5.7 Round-robin desempata por menor tiempo desde la última asignación

## Definición de terminado
- [ ] Un ticket con SLA de 2 minutos, sin responder, aparece marcado como incumplido y escalado a los 2 minutos exactos sin intervención manual
- [ ] Detener el proceso worker durante el vencimiento y reiniciarlo resulta en que el barrido procesa el vencimiento perdido en su siguiente ejecución
