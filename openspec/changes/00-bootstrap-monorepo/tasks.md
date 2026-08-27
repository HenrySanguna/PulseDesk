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
- [x] 3.2 Prisma con `prismaSchemaFolder`, `schema.prisma` mínimo, `output` a `libs/db/src/generated`
- [x] 3.3 Migración inicial: `CREATE EXTENSION IF NOT EXISTS citext;`
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
- [ ] Un push a `main` despliega `api` en Render y ambos frontends en Pages
- [x] `/health` responde con el SHA correcto y un latido de menos de 60s — verificado en vivo en `https://pulsedesk-api-u18w.onrender.com/health` (`commit` matchea el HEAD de `main`, `workerHeartbeatAgeSec: 6`)
- [ ] Un commit que solo toca `apps/agent-console` NO dispara build/test de `apps/api` (verificar en los logs de `nx affected`)
