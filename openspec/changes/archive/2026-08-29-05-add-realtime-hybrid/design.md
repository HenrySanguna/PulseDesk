# Design: Realtime Hybrid Transport

## Por qué SSE para el dashboard

`EventSource` da de serie: reconexión automática, y reanudación desde el último evento visto vía la cabecera `Last-Event-ID` que el navegador reenvía solo. Esto resuelve exactamente el problema que en CollabForge se resolvió con un snapshot completo al reconectar — aquí, en vez de reenviar todo el estado, el servidor reproduce solo los eventos posteriores al `Last-Event-ID` recibido. Es más eficiente en ancho de banda para un dashboard que emite actualizaciones frecuentes y pequeñas.

**Limitación aceptada**: `EventSource` no admite cabeceras personalizadas — por eso la autenticación de agente tuvo que ser por cookie (`add-dual-auth`), no JWT en `Authorization`.

## Por qué `ws` nativo para el chat, sin Socket.IO

El chat es genuinamente bidireccional y de baja latencia (typing indicators, presencia). Socket.IO daría salas, reconexión y fallback a polling gratis, pero también acopla cliente y servidor a su protocolo y añade overhead de framing. Escribirlo a mano con `ws` obliga a entender —no asumir— lo que Socket.IO resolvía:

```typescript
class NativeWsAdapter extends AbstractWsAdapter {
  create(port: number): WebSocketServer {
    return new WebSocketServer({ server: this.httpServer, path: '/ws', maxPayload: 64 * 1024 });
  }
}
```

- **Salas**: un `Map<conversationId, Set<WebSocket>>` mantenido a mano — no hay `.join()` nativo.
- **Heartbeat**: ping cada 30s; si no hay pong en 10s adicionales, se cierra la conexión (detecta conexiones muertas que TCP no reporta a tiempo).
- **Autenticación en el handshake**: la cookie de sesión de agente viaja automáticamente en el `Upgrade` HTTP; el token de widget se pasa como query param en la URL de conexión, ya que un cliente de widget no tiene cookie de agente.

## Bus de eventos worker → API

El worker (proceso separado) genera eventos que deben llegar a clientes SSE conectados a instancias de `api` que el worker no controla directamente. Se usa pub/sub de Valkey: el worker publica, cada instancia de `api` suscrita reenvía a sus conexiones SSE locales. Esto es lo que hace que el bus funcione incluso con `api` escalado horizontalmente (fuera del alcance del MVP, pero el diseño no lo bloquea).

## Idempotencia de mensajes del widget

`Message.clientMessageId` (definido en `add-ticket-queue`) es la clave: si el cliente del widget reenvía un mensaje tras una reconexión sin saber si el original llegó, la restricción única `[ticketId, clientMessageId]` en la base de datos rechaza el duplicado sin que el servidor tenga que llevar un registro de deduplicación aparte.
