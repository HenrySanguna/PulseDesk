# Design: Dual Authentication

## Sesiones de agente

```
POST /auth/login  { email, password }
  → Argon2 verifica password_hash
  → genera token de sesión aleatorio, lo hashea, lo guarda en Valkey
    con TTL igual a la expiración de la sesión
  → Set-Cookie: pd_session=<token crudo>; HttpOnly; Secure; SameSite=Strict
  → el cliente nunca ve el hash, el servidor nunca guarda el token crudo
```

**Revocación instantánea**: `DELETE` de la clave en Valkey. La siguiente petición con esa cookie falla en el guard porque la clave ya no existe — no hay ventana de espera como con la expiración de un JWT.

**Por qué Valkey y no una tabla de Postgres para las sesiones**: las sesiones se consultan en cada petición HTTP y en cada handshake de `ws`/SSE — es el camino más caliente de toda la aplicación. Valkey da lectura en submilisegundos y expiración nativa por TTL sin un job de limpieza.

## Token de widget

```
POST /widget/conversations  { customerSessionId }
  → crea (o recupera) el Customer y la Conversation
  → firma un JWT de vida corta (ej. 4h) con { conversationId, customerId }
  → el cliente lo reenvía en cada acción sobre ESA conversación
```

El guard `WidgetTokenGuard` verifica la firma y comprueba que el `conversationId` del token coincide con el recurso solicitado — un token de la conversación A nunca autoriza acciones sobre la conversación B, aunque ambas pertenezcan al mismo `customerId`.

## Por qué el mecanismo es distinto en cada caso

| | Sesión de agente | Token de widget |
|---|---|---|
| Necesita revocación instantánea | Sí (empleado despedido) | No (conversación efímera) |
| Viaja en `EventSource` | Sí, vía cookie | No aplica (el widget usa `ws`, no SSE) |
| Alcance | Toda la cuenta del agente | Una sola conversación |
| Mecanismo | Opaco + Valkey | JWT autocontenido |

## Riesgos
- Confundir los dos guards en una ruta (aplicar `WidgetTokenGuard` a un endpoint de agente) dejaría esa ruta sin protección real de rol. Se mitiga con un test que enumera todas las rutas y verifica que cada una tiene exactamente uno de los dos guards, nunca ninguno ni ambos.
