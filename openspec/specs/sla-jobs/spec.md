## ADDED Requirements

### Requirement: Idempotencia de trabajos de SLA
El sistema SHALL producir exactamente un efecto de negocio cuando un trabajo de vencimiento de SLA se ejecuta más de una vez, sin importar la causa de la reejecución.

#### Scenario: Reejecución directa del mismo trabajo
- **GIVEN** un trabajo de vencimiento de SLA que ya se ejecutó y marcó el reloj como incumplido
- **WHEN** el mismo trabajo se ejecuta una segunda vez (ej. por reintento de BullMQ tras una desconexión)
- **THEN** el estado del reloj permanece incumplido sin generar un segundo evento de escalado

#### Scenario: El barrido de recuperación no duplica un vencimiento ya procesado
- **GIVEN** un reloj cuyo vencimiento ya fue procesado por su trabajo puntual
- **WHEN** el trabajo repetible de barrido se ejecuta y encuentra ese mismo reloj
- **THEN** el barrido no vuelve a disparar el escalado para ese reloj

### Requirement: Pausa y reanudación conservan el tiempo consumido
El sistema SHALL calcular correctamente el tiempo laborable restante de un reloj de SLA a través de múltiples ciclos de pausa y reanudación.

#### Scenario: Un ciclo de pausa y reanudación
- **GIVEN** un reloj con SLA de 240 minutos, iniciado y consumidos 60 minutos laborables
- **WHEN** se pausa y luego se reanuda tras un intervalo
- **THEN** el nuevo vencimiento calculado corresponde a 180 minutos laborables restantes desde el instante de reanudación

#### Scenario: Múltiples ciclos consecutivos
- **GIVEN** el mismo reloj
- **WHEN** se pausa y reanuda tres veces consecutivas, consumiendo tiempo laborable entre cada ciclo
- **THEN** la suma de los minutos consumidos en cada ciclo, más los minutos restantes tras la última reanudación, es igual al SLA original (240 minutos)

### Requirement: Cancelación de vencimientos al completar un reloj
El sistema SHALL cancelar cualquier trabajo de vencimiento programado cuando el reloj asociado se marca como completado antes de tiempo.

#### Scenario: Resolución de ticket antes del vencimiento
- **GIVEN** un ticket con un reloj de SLA activo y un trabajo de vencimiento programado
- **WHEN** el ticket se resuelve antes de que el trabajo se ejecute
- **THEN** el trabajo de vencimiento programado no produce ningún efecto, incluso si su ejecución estuviera pendiente en la cola

### Requirement: Control de concurrencia sobre relojes de SLA
El sistema SHALL rechazar una actualización sobre un reloj de SLA cuando otro proceso lo modificó después de que la actualización actual leyera su estado.

#### Scenario: Dos procesos modifican el mismo reloj concurrentemente
- **GIVEN** un reloj de SLA leído simultáneamente por dos procesos distintos (por ejemplo, una pausa manual del agente y un vencimiento del worker)
- **WHEN** ambos procesos intentan escribir su actualización
- **THEN** exactamente uno tiene éxito
- **AND** el otro recibe un error de conflicto de versión sin haber corrompido el estado del reloj

### Requirement: Recuperación de vencimientos tras caída del worker
El sistema SHALL garantizar que ningún vencimiento de SLA se pierde de forma permanente si el proceso worker deja de ejecutarse durante el periodo de vencimiento.

#### Scenario: Worker caído en el momento del vencimiento
- **GIVEN** un reloj cuyo vencimiento cae en un momento en que el proceso worker no está operativo
- **WHEN** el worker se reinicia y se ejecuta el siguiente ciclo del trabajo de barrido
- **THEN** el reloj vencido se detecta y se procesa como incumplido, con un retraso acotado al intervalo del barrido

### Requirement: Auto-asignación respeta la capacidad del agente
El sistema SHALL excluir de la auto-asignación a cualquier agente cuya carga actual de tickets activos alcance su capacidad máxima configurada.

#### Scenario: Agente en capacidad máxima
- **GIVEN** un agente activo cuya carga de tickets abiertos/pendientes iguala su `maxCapacity`
- **WHEN** se dispara la auto-asignación para un ticket nuevo
- **THEN** ese agente no es candidato, independientemente de su disponibilidad
