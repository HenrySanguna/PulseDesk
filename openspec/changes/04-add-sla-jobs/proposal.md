# Proposal: Add SLA Jobs

## Intent
`libs/sla-engine` (Fase 1) sabe calcular vencimientos; este cambio lo conecta con relojes persistentes, trabajos programados en BullMQ y consumidores que reaccionan cuando un SLA está en riesgo o se incumple. Es la pieza que convierte PulseDesk en un sistema distribuido de verdad — un proceso (`api`) programa trabajos, otro proceso (`worker`) los ejecuta, y ambos deben sobrevivir a que el otro se caiga sin perder ni duplicar efectos.

## Scope

**In scope**
- `SlaClock`: reloj persistente por ticket y tipo (`first_response`, `resolution`), con pausa/reanudación.
- Colas BullMQ: `sla` (vencimientos), `assignment` (auto-asignación), `maintenance` (barrido de recuperación).
- Programación de vencimientos con `jobId` determinista (idempotencia por deduplicación de BullMQ).
- Idempotencia por relectura de estado en los consumidores (defensa adicional a la deduplicación por `jobId`).
- Escalado automático al incumplir SLA.
- Auto-asignación round-robin respetando la capacidad máxima de cada agente.
- Trabajo repetible de barrido (`sla:sweep`) como red de seguridad ante caídas del worker.
- Latido del worker en Valkey, expuesto en `/health`.

**Out of scope**
- Notificación al cliente final sobre el estado del SLA (no es parte del MVP).
- Reglas de SLA configurables por el usuario más allá de la política por prioridad ya definida.

## Approach
El `SlaClockRepository` envuelve Prisma con una guarda de versión manual (bloqueo optimista, ya que Prisma no tiene `@VersionColumn`). Cada operación de pausa/reanudación/completar es una transacción corta que actualiza el reloj y, en el mismo flujo, cancela o reprograma el trabajo de BullMQ correspondiente. La regla de oro de todo el cambio: **todo trabajo debe ser idempotente**, porque BullMQ puede ejecutar un trabajo más de una vez (reintentos, reconexión, el barrido de recuperación) y el sistema debe comportarse igual si eso ocurre.
