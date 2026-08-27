# Proposal: Add Dual Authentication

## Intent
PulseDesk tiene dos tipos de identidad completamente distintos: agentes internos que necesitan revocación instantánea (un agente despedido no puede seguir viendo tickets), y clientes anónimos del widget que solo necesitan probar que pertenecen a una conversación concreta durante su ciclo de vida. Forzar ambos casos al mismo mecanismo (JWT, como en CollabForge) sería inadecuado para los dos: JWT no se revoca instantáneamente, y una sesión con estado sería excesiva para un visitante anónimo de un widget.

## Scope

**In scope**
- Sesiones de agente: opacas, en cookie httpOnly, respaldadas en Valkey, revocables al instante.
- Token de widget: JWT firmado, efímero, con alcance a una única conversación.
- Guards HTTP: `AgentSessionGuard`, `WidgetTokenGuard`, `RoleGuard` (agent/supervisor/admin).
- Rate limiting en login y en creación de conversaciones desde el widget.

**Out of scope**
- Guards para los canales SSE/`ws` (Fase 5, `add-realtime-hybrid`) — ahí se reutiliza este mecanismo pero el detalle de propagación al handshake se especifica en ese cambio.
- OAuth social o SSO corporativo — email + contraseña únicamente en el MVP.

## Approach
Dos flujos de autenticación completamente separados que comparten la capa de guards de NestJS pero no comparten mecanismo de token. La razón concreta y no negociable de por qué las sesiones de agente no pueden ser JWT: `EventSource` (el cliente nativo de SSE que se usará en la Fase 5) no admite cabeceras HTTP personalizadas, así que un `Authorization: Bearer` es inviable para ese canal — la cookie sí viaja automáticamente.
