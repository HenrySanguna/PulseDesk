# Tasks: Add Realtime Hybrid Transport

## 1. SSE
- [ ] 1.1 Controlador SSE en `apps/api` con `Observable`, autenticado por `AgentSessionGuard`
- [ ] 1.2 Heartbeat (comentario SSE cada 20s para mantener la conexión viva a través de proxies)
- [ ] 1.3 Reanudación por `Last-Event-ID`: el servidor guarda un buffer corto de eventos recientes por agente/canal
- [ ] 1.4 Cliente `EventSource` en `apps/agent-console` con reconexión (nativa del navegador) y `DashboardStore` (SignalStore) alimentado por los eventos

## 2. `ws` nativo
- [ ] 2.1 `NativeWsAdapter` (`AbstractWsAdapter`) con `maxPayload` acotado
- [ ] 2.2 Handshake autenticado: cookie de sesión (agente) o query param de token (widget)
- [ ] 2.3 Gestión de salas por conversación (`Map<conversationId, Set<WebSocket>>`)
- [ ] 2.4 Heartbeat ping/pong con cierre de conexiones muertas
- [ ] 2.5 Cliente `WebSocket` propio con backoff exponencial en `apps/agent-console` y `apps/widget`
- [ ] 2.6 `ConversationStore` (SignalStore) alimentado por el canal `ws`
- [ ] 2.7 Indicadores de escritura y presencia de agentes

## 3. Bus worker → API
- [ ] 3.1 Publicación de eventos del worker en un canal pub/sub de Valkey
- [ ] 3.2 Suscripción de `apps/api` que reenvía a las conexiones SSE locales correspondientes

## 4. Widget
- [ ] 4.1 Página de prueba embebiendo el widget
- [ ] 4.2 Envío de mensajes con `clientMessageId` generado en cliente (idempotencia)

## 5. Tests
- [ ] 5.1 Un cliente SSE que se reconecta con `Last-Event-ID` recibe los eventos perdidos sin duplicados ni huecos
- [ ] 5.2 Un socket `ws` sin responder al ping en el plazo definido se cierra por el servidor
- [ ] 5.3 Un evento publicado por el worker llega a un cliente SSE conectado a la API (test de integración con Valkey real)
- [ ] 5.4 Reenviar el mismo `clientMessageId` tras una reconexión no crea un mensaje duplicado
- [ ] 5.5 Un token de widget de la conversación A no puede unirse a la sala `ws` de la conversación B (reutiliza el guard de `add-dual-auth`)

## Definición de terminado
- [ ] Con la consola de agente abierta en un navegador y el widget en otro, un mensaje enviado desde el widget aparece en la consola sin recargar
- [ ] El contador de la cola en el dashboard se actualiza solo, sin acción del usuario, cuando cambia el estado de un ticket desde otra sesión
