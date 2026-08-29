# Design: Ticket Queue

## Reclamo atómico de tickets

```typescript
const { count } = await prisma.ticket.updateMany({
  where: { id: ticketId, assigneeId: null },   // la condición de carrera vive aquí
  data:  { assigneeId: agentId, status: 'open' },
});
if (count === 0) throw new ConflictException('TICKET_ALREADY_CLAIMED');
```

PostgreSQL garantiza que solo una de las actualizaciones concurrentes ve `assignee_id IS NULL`. No hace falta transacción explícita ni bloqueo pesimista — el invariante completo cabe en la cláusula `WHERE`. Esto contrasta deliberadamente con el presupuesto de votos de CollabForge, donde el invariante ("no gastar más votos de los que tengo") no cabía en un `WHERE` y exigía leer, decidir y escribir bajo bloqueo pesimista.

`updateMany` de Prisma no soporta `RETURNING`, así que el ticket se relee tras confirmar el reclamo — un viaje extra, aceptado porque no está en un camino de alta frecuencia.

## Notas internas: filtrado en la consulta, no en el mapeo

```typescript
prisma.ticket.findFirst({
  where: { id, customerId },
  include: { messages: { where: { visibility: 'public' } } },
});
```

El filtro de visibilidad va en el `WHERE` de la consulta a Prisma, no en un `.filter()` posterior en memoria. Las notas internas nunca llegan a existir en el proceso que sirve a un cliente — es defensa en profundidad barata frente a un futuro descuido que olvide filtrar antes de serializar.

## Consultas de agregación

El dashboard necesita percentiles y conteos condicionales que Prisma no expresa en su API tipada. Van en `libs/db/src/queries/` como `$queryRaw` con interfaz de retorno declarada a mano y test de integración que verifica la forma real (detalle completo: ver el proyecto `project.md`, sección de convenciones Prisma).

## Riesgo: orden de un enum en Prisma
Prisma ordena `enum TicketPriority` por orden de **declaración** en el esquema, no alfabético. La cola ordena por prioridad descendente confiando en ese orden — reordenar el enum invertiría silenciosamente la prioridad de atención sin ningún error de compilación. Se cubre con un test dedicado (ver `tasks.md`).
