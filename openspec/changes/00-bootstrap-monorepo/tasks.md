# Tasks: Bootstrap Monorepo

## 1. Workspace y proyectos
- [x] 1.1 `create-nx-workspace` con preset integrado (TypeScript, sin framework por defecto)
- [x] 1.2 Generar `apps/api` (NestJS) y configurar el adaptador Fastify
- [x] 1.3 Generar `apps/worker` como aplicación NestJS standalone (sin HTTP)
- [x] 1.4 Generar `apps/agent-console` (Angular 21, standalone, zoneless)
- [x] 1.5 Generar `apps/widget` (Angular 21, standalone, zoneless, sin PrimeNG)
- [x] 1.6 Generar `libs/contracts`, `libs/db`, `libs/sla-engine`, `libs/ui`
- [x] 1.7 Etiquetar cada proyecto (`scope:*`, `type:*`) en su `project.json`

## 2. Fronteras de dependencia
- [x] 2.1 Configurar `@nx/enforce-module-boundaries` con las reglas de `project.md`
- [x] 2.2 Test de humo: un import ilegal (ej. `apps/agent-console` importando `libs/db`) debe fallar el lint

## 3. Datos y configuración
- [x] 3.1 `docker-compose.yml` local con PostgreSQL 16 y Valkey, con healthchecks
- [x] 3.1b Servicio `api` en `docker-compose.yml` con `depends_on: { postgres: condition: service_healthy, valkey: condition: service_healthy }` (gap encontrado en sdd-verify: compose solo traía postgres/valkey, sin servicio `api` que esperara su salud) — cerrado: servicio `api` agregado (`build: { context: ., dockerfile: Dockerfile }`, `DATABASE_URL`/`REDIS_URL` apuntando a `postgres`/`valkey` por nombre de servicio); validado con `docker compose config` (sintaxis) y en vivo con `docker compose up -d --build`: log de eventos muestra `postgres`/`valkey` en `Waiting` → `Healthy` antes de `api-1 Starting`/`Started`; `docker compose ps` confirma los tres contenedores `Up`/`healthy`; `curl http://localhost:3000/health` devolvió `{"db":"ok","valkey":"ok","commit":"dev","contractsVersion":"unknown","workerHeartbeatAgeSec":9}`. Stack removida después (`docker compose down -v`)
- [x] 3.2 Prisma con `prismaSchemaFolder`, `schema.prisma` mínimo, `output` a `libs/db/src/generated`
- [x] 3.3 Migración inicial: `CREATE EXTENSION IF NOT EXISTS citext;`
- [x] 3.3b `prisma migrate deploy` como step en `ci.yml` (job `lint-and-test`, contra el Postgres de servicio) corrido dos veces seguidas para probar que la migración de `citext` aplica limpio y es idempotente en re-run (gap encontrado en sdd-verify: sin prueba automatizada en ningún lado) — cerrado: dos steps nuevos en `lint-and-test` (`Apply migrations` + `Re-apply migrations`, ambos `pnpm exec prisma migrate deploy`) entre `prisma generate` y `nx affected -t lint test`, usando el `DATABASE_URL` ya definido a nivel de job contra el Postgres de servicio. Validado en vivo en este sandbox: la ejecución directa `pnpm exec prisma migrate deploy` en el host Windows reprodujo el mismo P1000 auth-error ya documentado en verify-report.md (quirk local de Prisma-CLI-en-Windows contra el port-forwarding de Docker Desktop, no un defecto de la app — confirmado otra vez con `psql` directo aceptando las mismas credenciales). Se validó igual el comportamiento real ejecutando `prisma migrate deploy` dentro de un contenedor Linux (`docker build --target deps`) conectado a la red de compose por nombre de servicio (`postgres:5432`), que es el escenario representativo del runner de GitHub Actions: 1ra corrida -> `Applying migration 0001_init` / `All migrations have been successfully applied`; 2da corrida -> `No pending migrations to apply` (idempotente, sin error); `SELECT extname FROM pg_extension WHERE extname = 'citext'` confirma la extensión presente exactamente una vez. Imagen temporal y stack removidas después
- [x] 3.4 Configuración validada con Zod/class-validator en `apps/api` y `apps/worker`: el proceso no arranca sin `DATABASE_URL`, `REDIS_URL` y los secretos mínimos

## 4. Observabilidad mínima
- [x] 4.1 Endpoint `/health` en `apps/api`: estado de Postgres, estado de Valkey, `commit` (SHA inyectado en build), `contractsVersion` — implementado en `fac6b40`; SHA inyectado vía `ARG GIT_SHA` en el Dockerfile + `--build-arg` en `release.yml` (5.3/5.5), verificado end-to-end
- [x] 4.2 Heartbeat: `HeartbeatService` dentro de `apps/api` (ya no proceso `worker` separado) escribe timestamp en Valkey cada 15s vía `setInterval`; `/health` lo expone

## 5. CI/CD
- [x] 5.1 `ci.yml` con job `affected` (`nx show projects --affected`) usando `fetch-depth: 0` y `nrwl/nx-set-shas`
- [x] 5.2 Jobs `lint-and-test` (con servicios Postgres + Valkey) y `e2e` condicionados a los proyectos afectados
- [x] 5.3 Dockerfile multi-stage de imagen única, un solo runtime stage (`api`, ya no hay app `worker` separada), runtime no-root — verificado con build+prune+install aislado
- [x] 5.4 Hosting: Render free web service (no Fly — Fly no tiene free tier real, solo trial de 2h/7 días y factura sin techo gratuito después). Servicio en Render creado manualmente por el usuario en el dashboard (root directory `.`, Dockerfile en la raíz, auto-deploy desactivado); repo solo guarda el `RENDER_DEPLOY_HOOK_URL` como secret
- [x] 5.5 `release.yml`: `curl` al Deploy Hook de Render + verificación de SHA en `/health` (`RENDER_GIT_COMMIT`, inyectado automáticamente por Render; cubre el heartbeat también, ya que `/health` devuelve 503 si está stale)
- [x] 5.6 Despliegue de `agent-console` y `widget` a Cloudflare Pages (dos proyectos de Pages distintos), condicionado a affected

## Definición de terminado
- [x] Un push a `main` despliega `api` en Render y ambos frontends en Pages — verificado: `deploy-agent-console` y `deploy-widget` en éxito en el run de Release `33064142767` (deploy directo vía `cloudflare/pages-action`, confirmado en el dashboard de Cloudflare Pages con "No git connection", i.e. no hay integración Git nativa compitiendo); `api`/Render cubierto por el ítem de `/health` de abajo
- [x] `/health` responde con el SHA correcto y un latido de menos de 60s — verificado en vivo en `https://pulsedesk-api-u18w.onrender.com/health` (`commit` matchea el HEAD de `main`, `workerHeartbeatAgeSec: 6`)
- [x] Un commit que solo toca `apps/agent-console` NO dispara build/test de `apps/api` — verificado localmente: `pnpm nx show projects --affected --files=apps/agent-console/src/main.ts --json` devuelve `["agent-console"]`, sin `api`
