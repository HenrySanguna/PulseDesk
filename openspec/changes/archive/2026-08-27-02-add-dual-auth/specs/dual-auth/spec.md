## ADDED Requirements

### Requirement: Autenticación de agentes por sesión opaca
El sistema SHALL autenticar a los agentes mediante un token de sesión opaco almacenado en una cookie httpOnly, verificado contra un almacén de sesiones revocable, en lugar de un token autocontenido.

#### Scenario: Login exitoso
- **GIVEN** un agente activo con credenciales válidas
- **WHEN** envía email y contraseña correctos a `/auth/login`
- **THEN** el sistema responde con una cookie `HttpOnly`, `Secure`, `SameSite=Strict` conteniendo un token de sesión opaco
- **AND** el cuerpo de la respuesta no contiene `passwordHash` en ningún campo

#### Scenario: Credenciales inválidas no revelan si el email existe
- **GIVEN** un intento de login con un email que no existe y otro con contraseña incorrecta para un email existente
- **WHEN** ambos se envían a `/auth/login`
- **THEN** ambos reciben exactamente el mismo mensaje y código de error

### Requirement: Revocación instantánea de sesiones de agente
El sistema SHALL invalidar una sesión de agente de forma inmediata cuando se revoca, sin depender de la expiración natural del token.

#### Scenario: Revocación al desactivar un agente
- **GIVEN** un agente con una sesión activa
- **WHEN** un administrador desactiva la cuenta de ese agente
- **THEN** cualquier petición posterior autenticada con la cookie de sesión de ese agente es rechazada con 401
- **AND** el rechazo ocurre en la primera petición tras la desactivación, no tras un periodo de expiración

#### Scenario: Logout revoca la sesión actual
- **GIVEN** un agente autenticado
- **WHEN** invoca `/auth/logout`
- **THEN** la cookie de sesión deja de ser válida para peticiones subsiguientes

### Requirement: Token de widget con alcance a una sola conversación
El sistema SHALL emitir para cada conversación de widget un token firmado cuyo alcance de autorización se limita exclusivamente a esa conversación.

#### Scenario: Token válido para su propia conversación
- **GIVEN** un token de widget emitido para la conversación A
- **WHEN** se usa para enviar un mensaje en la conversación A
- **THEN** la acción se autoriza

#### Scenario: Token rechazado fuera de su conversación
- **GIVEN** un token de widget emitido para la conversación A
- **WHEN** se usa para intentar leer o escribir en la conversación B, incluso si ambas pertenecen al mismo cliente
- **THEN** la acción se rechaza con un error de autorización

### Requirement: Separación estricta de guards por tipo de identidad
El sistema SHALL garantizar que ningún endpoint HTTP acepta simultáneamente autenticación de sesión de agente y de token de widget, y que todo endpoint que requiere identidad usa exactamente uno de los dos mecanismos.

#### Scenario: Cobertura completa de guards
- **GIVEN** el conjunto completo de rutas HTTP de `apps/api` que requieren identidad
- **WHEN** se audita cada ruta
- **THEN** cada una tiene aplicado exactamente uno de `AgentSessionGuard` o `WidgetTokenGuard`, nunca ambos ni ninguno
