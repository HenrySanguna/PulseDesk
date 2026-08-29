## ADDED Requirements

### Requirement: Asignación atómica de tickets
El sistema SHALL garantizar que, cuando dos o más agentes intentan reclamar el mismo ticket sin asignar de forma concurrente, exactamente uno de los intentos tiene éxito.

#### Scenario: Dos agentes reclaman el mismo ticket a la vez
- **GIVEN** un ticket sin asignar
- **WHEN** dos agentes distintos invocan `POST /tickets/:id/claim` de forma concurrente
- **THEN** exactamente uno recibe una respuesta de éxito con el ticket asignado a su nombre
- **AND** el otro recibe un error de conflicto indicando que el ticket ya fue reclamado

#### Scenario: Reclamar un ticket ya asignado
- **GIVEN** un ticket ya asignado a un agente
- **WHEN** otro agente intenta reclamarlo
- **THEN** la operación se rechaza con un error de conflicto, sin modificar la asignación existente

### Requirement: Máquina de estados del ticket
El sistema SHALL permitir únicamente transiciones de estado válidas según el ciclo de vida definido del ticket, rechazando cualquier transición no contemplada.

#### Scenario: Transición válida
- **GIVEN** un ticket en estado `open`
- **WHEN** se solicita la transición a `pending`
- **THEN** la transición se aplica y el nuevo estado es `pending`

#### Scenario: Transición inválida rechazada
- **GIVEN** un ticket en estado `new`
- **WHEN** se solicita la transición directa a `closed`
- **THEN** la operación se rechaza sin modificar el estado del ticket

### Requirement: Aislamiento de notas internas
El sistema SHALL excluir las notas marcadas como internas de cualquier respuesta servida a un cliente, garantizando el filtrado a nivel de consulta antes de que los datos abandonen la capa de persistencia.

#### Scenario: Cliente consulta el hilo de su ticket
- **GIVEN** un ticket con mensajes públicos y notas internas mezclados
- **WHEN** el cliente propietario del ticket consulta el hilo de mensajes
- **THEN** la respuesta contiene únicamente los mensajes con visibilidad pública

#### Scenario: Agente consulta el mismo hilo
- **GIVEN** el mismo ticket
- **WHEN** un agente autenticado consulta el hilo de mensajes
- **THEN** la respuesta contiene tanto los mensajes públicos como las notas internas

### Requirement: Priorización correcta de la cola
El sistema SHALL ordenar la cola de tickets sin asignar por prioridad descendente (urgent > high > normal > low) y, dentro de la misma prioridad, por antigüedad ascendente.

#### Scenario: Orden mixto de prioridades
- **GIVEN** tickets sin asignar con prioridades `normal`, `urgent` y `low`, creados en ese orden
- **WHEN** se consulta la cola
- **THEN** el ticket `urgent` aparece primero, seguido del `normal`, seguido del `low`
