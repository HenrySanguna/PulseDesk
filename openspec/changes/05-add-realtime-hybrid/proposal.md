# Proposal: Add Realtime Hybrid Transport

## Intent
PulseDesk tiene dos necesidades de tiempo real con formas distintas: el dashboard de cola solo necesita que el servidor empuje actualizaciones (unidireccional), mientras que el chat necesita que ambos lados hablen con baja latencia (bidireccional). Usar Socket.IO para todo, como en CollabForge, sería la opción cómoda pero no la correcta aquí — obligaría a simular unidireccionalidad sobre un transporte pensado para bidireccional. Este cambio implementa SSE para lo primero y un adaptador `ws` nativo propio para lo segundo, sobre la autenticación ya construida en `add-dual-auth`.

## Scope

**In scope**
- Controlador SSE (`Observable` de NestJS) para el dashboard y notificaciones, con heartbeat y reanudación por `Last-Event-ID`.
- Adaptador `ws` nativo (sin Socket.IO): handshake autenticado por cookie de sesión, salas por conversación, ping/pong.
- Bus de eventos worker → API, para que los eventos generados por BullMQ (vencimientos, escalados) lleguen a los clientes SSE conectados a un proceso `api` distinto del que los generó.
- Reconexión con backoff en ambos clientes (dashboard y chat).
- Indicadores de escritura y presencia de agentes sobre el canal `ws`.
- Widget embebible funcional con su propio cliente `ws`.

**Out of scope**
- Videollamada o audio.
- Multiplexado de varios canales SSE en una sola conexión — cada dashboard abre una conexión SSE dedicada.

## Approach
Dos implementaciones deliberadamente separadas y sin abstracción común forzada entre ellas: forzar una interfaz compartida entre "servidor que empuja" y "servidor que conversa" produciría una abstracción con fugas. Cada cliente (SSE en el dashboard, `ws` en el chat) usa la primitiva nativa del navegador (`EventSource`, `WebSocket`) sin librería intermedia, lo que exige implementar a mano lo que Socket.IO daba gratis en CollabForge: heartbeat, reconexión con backoff, y en el caso de SSE, reanudación con `Last-Event-ID`.
