## ADDED Requirements

### Requirement: Propagación de traza a través de trabajos encolados
El sistema SHALL propagar el identificador de traza de la petición HTTP originadora a través del payload de cualquier trabajo de BullMQ que esa petición encole, de modo que la traza completa sea reconstruible de extremo a extremo.

#### Scenario: Traza completa de un vencimiento de SLA
- **GIVEN** una petición HTTP que crea un ticket y programa un trabajo de vencimiento de SLA
- **WHEN** el trabajo se ejecuta en el proceso worker y publica un evento en el bus hacia la API
- **THEN** el identificador de traza es idéntico en los cuatro puntos: la petición HTTP original, el trabajo encolado, su procesamiento en el worker, y el evento SSE resultante

### Requirement: Presencia de agentes por ticket
El sistema SHALL notificar a los agentes que tienen abierto un ticket cuando otro agente abre el mismo ticket simultáneamente.

#### Scenario: Dos agentes abren el mismo ticket
- **GIVEN** un agente con un ticket abierto en su consola
- **WHEN** un segundo agente abre el mismo ticket
- **THEN** el primer agente recibe un aviso indicando que otro agente también está viendo ese ticket

### Requirement: Navegación completa por teclado
El sistema SHALL permitir completar el flujo de gestión de un ticket (localizar, abrir, responder, cambiar de estado) usando exclusivamente el teclado, sin requerir interacción con el ratón.

#### Scenario: Gestión de ticket sin ratón
- **GIVEN** un agente autenticado usando únicamente el teclado
- **WHEN** navega desde la tabla de tickets hasta responder y cerrar uno concreto
- **THEN** cada paso del flujo es alcanzable y accionable mediante foco de teclado, con indicación visual de foco en todo momento
