# Tasks: Add Dual Authentication

## 1. Esquema
- [ ] 1.1 Modelo `Agent` en Prisma (email `citext`, `passwordHash`, `role`, `availability`, `maxCapacity`, `isActive`)
- [ ] 1.2 Tipo `PublicAgent` (select sin `passwordHash`) + regla de lint que prohíbe `passwordHash` fuera de `libs/db` y `apps/api/src/auth`

## 2. Sesiones de agente
- [ ] 2.1 `POST /auth/login`: Argon2, genera token de sesión, guarda hash en Valkey con TTL
- [ ] 2.2 Cookie httpOnly/Secure/SameSite=Strict con el token crudo
- [ ] 2.3 `POST /auth/logout`: elimina la clave de Valkey
- [ ] 2.4 `AgentSessionGuard`: lee la cookie, verifica contra Valkey, inyecta `PublicAgent` en el request
- [ ] 2.5 Endpoint administrativo para desactivar un agente → revoca todas sus sesiones activas

## 3. Token de widget
- [ ] 3.1 `POST /widget/conversations`: crea/recupera Customer + Conversation, firma JWT de conversación
- [ ] 3.2 `WidgetTokenGuard`: verifica firma y que `conversationId` del token coincide con el recurso pedido

## 4. Autorización
- [ ] 4.1 `RoleGuard` (agent/supervisor/admin) componible con `AgentSessionGuard`
- [ ] 4.2 Rate limiting: login (intentos por IP), creación de conversaciones de widget (por IP/sesión de cliente)

## 5. Tests
- [ ] 5.1 Revocar una sesión de agente invalida la petición siguiente (no la actual en curso, la siguiente)
- [ ] 5.2 Un token de widget de la conversación A es rechazado en la conversación B
- [ ] 5.3 Login con credenciales inválidas no revela si el email existe (mismo mensaje de error)
- [ ] 5.4 Test de enumeración de rutas: cada endpoint de agente tiene `AgentSessionGuard`, cada endpoint de widget tiene `WidgetTokenGuard`, ninguno tiene ambos ni ninguno

## Definición de terminado
- [ ] Cobertura de `apps/api/src/auth` ≥ 95%
- [ ] Desactivar un agente en un test provoca que su cookie de sesión falle en la petición inmediatamente posterior
