## ADDED Requirements

### Requirement: Reanudación de flujo SSE sin pérdida de eventos
El sistema SHALL permitir que un cliente SSE reconectado, aportando el identificador del último evento recibido, reciba todos los eventos generados mientras estuvo desconectado, sin duplicados.

#### Scenario: Reconexión tras una desconexión breve
- **GIVEN** un cliente conectado al flujo SSE del dashboard que recibió eventos hasta un identificador conocido
- **WHEN** se desconecta brevemente y se reconecta indicando ese identificador como `Last-Event-ID`
- **THEN** recibe exactamente los eventos generados después de ese identificador, sin repetir ninguno anterior

### Requirement: Cierre de conexiones `ws` inactivas
El sistema SHALL cerrar del lado del servidor cualquier conexión `ws` que no responda a un ping dentro del plazo definido, para liberar recursos de conexiones muertas que TCP no reporta a tiempo.

#### Scenario: Cliente que deja de responder
- **GIVEN** una conexión `ws` activa y autenticada
- **WHEN** el cliente no responde con un pong dentro del plazo tras un ping del servidor
- **THEN** el servidor cierra la conexión y libera los recursos asociados a esa sala

### Requirement: Propagación de eventos generados por el worker
El sistema SHALL entregar a los clientes SSE conectados a un proceso `api` los eventos generados por el proceso `worker`, incluso cuando ambos procesos son instancias distintas.

#### Scenario: Vencimiento de SLA visible en el dashboard
- **GIVEN** un cliente SSE conectado al dashboard de un agente
- **WHEN** el proceso worker marca un reloj de SLA como incumplido
- **THEN** el cliente SSE recibe el evento correspondiente sin que el proceso `api` haya originado el vencimiento directamente

### Requirement: Idempotencia de mensajes reenviados por reconexión
El sistema SHALL rechazar como duplicado un mensaje de chat reenviado tras una reconexión cuando comparte el identificador de cliente de un mensaje ya persistido para la misma conversación.

#### Scenario: Reenvío tras reconexión sin confirmación
- **GIVEN** un mensaje enviado desde el widget con un identificador de cliente, cuya confirmación de entrega no llegó al cliente antes de una desconexión
- **WHEN** el cliente se reconecta y reenvía el mismo mensaje con el mismo identificador de cliente
- **THEN** el sistema no crea un segundo mensaje en la conversación, y responde con la confirmación del mensaje ya existente

### Requirement: Aislamiento de salas de conversación en el canal `ws`
El sistema SHALL garantizar que un mensaje enviado en una conversación solo se entrega a los participantes conectados a la sala de esa misma conversación.

#### Scenario: Mensaje no filtra a otra conversación
- **GIVEN** dos conversaciones activas distintas con agentes conectados a cada una
- **WHEN** se envía un mensaje en la primera conversación
- **THEN** únicamente los sockets unidos a la sala de la primera conversación lo reciben
