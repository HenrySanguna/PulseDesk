# Design: SLA Jobs

## Bloqueo optimista manual (Prisma no tiene `@VersionColumn`)

```typescript
async update(id: string, version: number, data: Prisma.SlaClockUpdateInput) {
  const { count } = await prisma.slaClock.updateMany({
    where: { id, version },                         // guarda de versión
    data:  { ...data, version: { increment: 1 } },
  });
  if (count === 0) throw new SlaClockConflictException(id);  // otro proceso ganó
}
```

Este conflicto no es un caso raro: un agente pausando el reloj (proceso `api`) y un trabajo de vencimiento disparándose (proceso `worker`) pueden tocar el mismo reloj casi simultáneamente. Cada llamante decide cómo reaccionar — la API reintenta releyendo, el worker descarta el trabajo sin error (si el reloj cambió, el estado que motivó el vencimiento probablemente ya no aplica).

## Dos capas de idempotencia

1. **`jobId` determinista**: `sla:${clockId}:${targetMinutes}` — BullMQ deduplica automáticamente si se intenta encolar el mismo `jobId` dos veces.
2. **Relectura de estado en el consumidor**: antes de actuar, el consumidor relee el reloj y comprueba que sigue en el estado que justifica la acción (no pausado, no completado). Esto cubre el caso en que el `jobId` cambia legítimamente (reprogramación tras reanudar) pero el trabajo antiguo, si sobreviviera por algún fallo de cancelación, no debe producir un efecto duplicado.

## El barrido de recuperación (`sla:sweep`)

Trabajo repetible (cada 5 minutos) que consulta todos los relojes con `dueAt < now()` y `breachedAt IS NULL`, y dispara la lógica de incumplimiento para los que el trabajo puntual no procesó — típicamente porque el worker estuvo caído en el momento exacto del vencimiento. No es un sustituto de los trabajos programados (que dan reacción en segundos); es la garantía de que ningún vencimiento se pierde definitivamente por una caída del proceso.

## Auto-asignación round-robin

Consulta `getAgentLoad` (de `add-ticket-queue`) para encontrar el agente disponible con menor carga relativa a su capacidad; si empatan, gana el que lleva más tiempo sin recibir asignación. Se ejecuta como consumidor de la cola `assignment`, disparado al crear un ticket sin agente preasignado.
