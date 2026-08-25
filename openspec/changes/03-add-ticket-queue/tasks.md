# Tasks: Add Ticket Queue

## 1. Esquema
- [ ] 1.1 Modelos `Customer`, `Ticket`, `Message`, `TicketEvent`, `SlaPolicy` en Prisma
- [ ] 1.2 Índices: parcial de cola (`assignee_id IS NULL AND status = 'new'`), `[assigneeId, status]`, `[customerId]`
- [ ] 1.3 `@@unique([ticketId, clientMessageId])` en `Message` (idempotencia de reenvío, se usará en Fase 5)
- [ ] 1.4 Migración con índices parciales añadidos a mano (Prisma no los expresa en el esquema)

## 2. Dominio
- [ ] 2.1 Máquina de estados del ticket con transiciones válidas explícitas (rechazar transiciones inválidas)
- [ ] 2.2 `POST /tickets`, `GET /tickets` (filtros: status, priority, assignee, paginación), `GET /tickets/:id`
- [ ] 2.3 `POST /tickets/:id/claim` — reclamo atómico vía `updateMany` condicional
- [ ] 2.4 `PATCH /tickets/:id/status` con validación de transición
- [ ] 2.5 Notas internas: `POST /tickets/:id/messages` con `visibility: internal|public`, filtrado en la consulta según el rol del solicitante

## 3. Consultas de agregación (`libs/db/src/queries/`)
- [ ] 3.1 `getDashboardSnapshot`: conteos por estado, percentil de primera respuesta, tickets en riesgo
- [ ] 3.2 `getAgentLoad`: carga por agente con window function
- [ ] 3.3 Interfaz de retorno declarada a mano para cada consulta + test de integración que verifica la forma real
- [ ] 3.4 Función de mapeo que convierte `bigint` (de `count()`) a `number` antes de serializar

## 4. Frontend (sin tiempo real todavía)
- [ ] 4.1 Tabla de tickets con PrimeNG: filtros, orden, paginación (recarga manual, sin push)
- [ ] 4.2 Vista de detalle de ticket con hilo de mensajes y notas internas
- [ ] 4.3 Envolver los componentes de PrimeNG usados en `libs/ui`

## 5. Tests
- [ ] 5.1 Dos agentes reclamando el mismo ticket concurrentemente → exactamente uno gana (test de integración con `Promise.all`)
- [ ] 5.2 Transición de estado inválida (ej. `new` → `closed` directo) se rechaza
- [ ] 5.3 Las notas internas nunca aparecen en la respuesta cuando el solicitante es el cliente
- [ ] 5.4 El enum `TicketPriority` conserva el orden de declaración y la cola prioriza correctamente
- [ ] 5.5 Test de forma para cada consulta cruda (`getDashboardSnapshot`, `getAgentLoad`)

## Definición de terminado
- [ ] Un agente gestiona un ticket de principio a fin (crear → reclamar → responder → resolver → cerrar) refrescando la página manualmente
- [ ] El índice parcial de cola existe tras aplicar las migraciones (verificado por test, no solo por inspección)
