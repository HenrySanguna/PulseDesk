# Tasks: Add Dual Authentication

## 1. Esquema
- [x] 1.1 Modelo `Agent` en Prisma (email `citext`, `passwordHash`, `role`, `availability`, `maxCapacity`, `isActive`) — `libs/db/prisma/schema/agent.prisma` (+ `AgentRole`/`AgentAvailability` enums). Migración `libs/db/prisma/migrations/20260827154358_add_agent_and_widget_models/migration.sql` generada con `prisma migrate dev` (no SQL escrito a mano) y aplicada dos veces (`prisma migrate deploy`) contra Postgres real vía docker-compose para probar idempotencia — ver evidencia abajo. También añade `Customer`/`Conversation` (necesarios para 3.1).
- [x] 1.2 Tipo `PublicAgent` (select sin `passwordHash`) + regla de lint que prohíbe `passwordHash` fuera de `libs/db` y `apps/api/src/auth` — `libs/db/src/lib/public-agent.ts` (`PublicAgent`, `AGENT_PUBLIC_SELECT`, `toPublicAgent`); regla `no-restricted-syntax` en `eslint.config.mjs` (raíz), desactivada solo en `libs/db/eslint.config.mjs` y `apps/api/eslint.config.mjs` (`files: ['src/auth/**/*.ts']`). Verificado en vivo: una referencia de prueba a `passwordHash` en `apps/api/src/app/app.service.ts` (fuera de las áreas permitidas) produjo 2 errores de lint reales; removida antes de continuar.

## 2. Sesiones de agente
- [x] 2.1 `POST /auth/login`: Argon2, genera token de sesión, guarda hash en Valkey con TTL — `apps/api/src/auth/auth.controller.ts` + `auth.service.ts` (Argon2id vía `password.service.ts`) + `sessions.service.ts` (SHA-256 del token, nunca el crudo, en `pd:session:<hash>` con TTL de `AGENT_SESSION_TTL_SEC`).
- [x] 2.2 Cookie httpOnly/Secure/SameSite=Strict con el token crudo — `AuthController.login`, `reply.setCookie(SESSION_COOKIE_NAME, sessionToken, { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: AGENT_SESSION_TTL_SEC })`. `@fastify/cookie` registrado en `apps/api/src/main.ts`.
- [x] 2.3 `POST /auth/logout`: elimina la clave de Valkey — `AuthController.logout` → `AuthService.logout` → `SessionsService.revokeSession`.
- [x] 2.4 `AgentSessionGuard`: lee la cookie, verifica contra Valkey, inyecta `PublicAgent` en el request — `apps/api/src/auth/agent-session.guard.ts` (usa `AGENT_PUBLIC_SELECT`, nunca toca `passwordHash`).
- [x] 2.5 Endpoint administrativo para desactivar un agente → revoca todas sus sesiones activas — `PATCH /auth/agents/:id/deactivate` (`AgentsController`, `AgentSessionGuard` + `RoleGuard(ADMIN)`) → `AuthService.deactivateAgent` → `SessionsService.revokeAllSessions`.

## 3. Token de widget
- [x] 3.1 `POST /widget/conversations`: crea/recupera Customer + Conversation, firma JWT de conversación — `apps/api/src/widget/widget.service.ts` (`upsert` por `sessionId`, recupera la conversación más reciente o crea una nueva; JWT vía `@nestjs/jwt`, TTL 4h).
- [x] 3.2 `WidgetTokenGuard`: verifica firma y que `conversationId` del token coincide con el recurso pedido — `apps/api/src/widget/widget-token.guard.ts` (verifica firma+expiración con `jwt.verifyAsync`, compara `payload.conversationId` contra `:conversationId` de la ruta).

## 4. Autorización
- [x] 4.1 `RoleGuard` (agent/supervisor/admin) componible con `AgentSessionGuard` — `apps/api/src/auth/role.guard.ts` + `decorators/roles.decorator.ts`; usado en `AgentsController` como `@UseGuards(AgentSessionGuard, RoleGuard)`.
- [x] 4.2 Rate limiting: login (intentos por IP), creación de conversaciones de widget (por IP/sesión de cliente) — `@nestjs/throttler` `ThrottlerGuard` por-ruta: `AuthController.login` (5/60s), `WidgetController.createConversation` (10/60s), cada uno con su propio `ThrottlerModule.forRoot(...)` en `auth.module.ts`/`widget.module.ts`.

## 5. Tests
- [x] 5.1 Revocar una sesión de agente invalida la petición siguiente (no la actual en curso, la siguiente) — `agent-session.guard.spec.ts` ("revoking a session invalidates the NEXT request, not the one already granted").
- [x] 5.2 Un token de widget de la conversación A es rechazado en la conversación B — `widget-token.guard.spec.ts` ("5.2: rejects a token for conversation A when used on conversation B...").
- [x] 5.3 Login con credenciales inválidas no revela si el email existe (mismo mensaje de error) — `auth.service.spec.ts`, bloque "non-enumeration (5.3)": mismo mensaje/status para contraseña incorrecta vs. email inexistente, y assertion byte-a-byte de que ambas respuestas de error son idénticas (`getResponse()`/`getStatus()`).
- [x] 5.4 Test de enumeración de rutas: cada endpoint de agente tiene `AgentSessionGuard`, cada endpoint de widget tiene `WidgetTokenGuard`, ninguno tiene ambos ni ninguno — `route-guard-enumeration.spec.ts`: audita `AuthController`, `AgentsController`, `WidgetController`, `HealthController` vía metadata real de Nest (`GUARDS_METADATA`/`PATH_METADATA`); rutas explícitamente `@Public()` (login, creación de conversación, `/health`) quedan exentas por diseño (opt-out explícito, no implícito).

## Definición de terminado
- [x] Cobertura de `apps/api/src/auth` ≥ 95% — confirmado en vivo (`vitest run apps/api/src/auth --coverage`): **100% statements, 97.67% branch, 100% functions, 100% lines** (58 tests, 12 archivos). Suite completa de `apps/api` (auth + widget + health): 82 tests, 18 archivos, todos en verde.
- [x] Desactivar un agente en un test provoca que su cookie de sesión falle en la petición inmediatamente posterior — `deactivation-revokes-sessions.spec.ts`: llama al `AuthService.deactivateAgent` real (mismo código que usa el endpoint admin) encadenado a un `AgentSessionGuard` real; la petición N (con la cookie) pasa, se desactiva, y la petición N+1 con la MISMA cookie falla con `UnauthorizedException`, aislando específicamente el mecanismo de revocación en Valkey (el mock de Prisma mantiene `isActive: true` a propósito para que la prueba no dependa también de esa defensa secundaria).

## Evidencia de ejecución real

- Migración generada con `prisma migrate dev --name add_agent_and_widget_models` dentro de un contenedor Linux (`docker build --target deps`) conectado a la red de `docker-compose` por nombre de servicio (`postgres:5432`) — el mismo patrón que 00-bootstrap-monorepo documentó para esquivar el quirk de Prisma-CLI-en-Windows contra el port-forwarding de Docker Desktop (P1000 reproducido y confirmado como el mismo problema, no un defecto nuevo).
- `prisma migrate deploy` corrido dos veces seguidas contra una base de datos limpia (volúmenes recreados): 1ª corrida → aplica ambas migraciones; 2ª corrida → "No pending migrations to apply" (idempotente).
- Verificado con `psql` directo: tabla `Agent.email` es `citext`; `pg_extension` confirma `citext` presente.
- `pnpm exec vitest run apps/api --coverage`: 18 test files, 82 tests, todos en verde.
- `pnpm nx run-many -t lint test build --all`: los 7 proyectos (agent-console, sla-engine, contracts, widget, api, db, ui) en verde — 0 errores de lint (regla `no-restricted-syntax` incluida), 0 tests fallidos, build sin errores (solo warnings benignos preexistentes de sourcemaps de `@nestjs/throttler` y fallback opcional de `pg-native`, no relacionados con este cambio).
- Hallazgo preexistente, fuera de alcance: `nx run db:typecheck` falla con `TS2709`/`TS2351` en `libs/db/src/lib/valkey.provider.ts` (no tocado por este cambio) por el tipado de `ioredis` bajo `moduleResolution: nodenext`. Confirmado que el fallo ya existía ANTES de este cambio (`git stash` + re-run del baseline). No forma parte del target `test`/`build`/`lint` solicitado y no bloquea ninguna prueba de este cambio.
