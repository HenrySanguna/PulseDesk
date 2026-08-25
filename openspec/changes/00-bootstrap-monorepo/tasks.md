# Tasks: Bootstrap Monorepo

## 1. Workspace y proyectos
- [ ] 1.1 `create-nx-workspace` con preset integrado (TypeScript, sin framework por defecto)
- [ ] 1.2 Generar `apps/api` (NestJS) y configurar el adaptador Fastify
- [ ] 1.3 Generar `apps/worker` como aplicación NestJS standalone (sin HTTP)
- [ ] 1.4 Generar `apps/agent-console` (Angular 21, standalone, zoneless)
- [ ] 1.5 Generar `apps/widget` (Angular 21, standalone, zoneless, sin PrimeNG)
- [ ] 1.6 Generar `libs/contracts`, `libs/db`, `libs/sla-engine`, `libs/ui`
- [ ] 1.7 Etiquetar cada proyecto (`scope:*`, `type:*`) en su `project.json`

## 2. Fronteras de dependencia
- [ ] 2.1 Configurar `@nx/enforce-module-boundaries` con las reglas de `project.md`
- [ ] 2.2 Test de humo: un import ilegal (ej. `apps/agent-console` importando `libs/db`) debe fallar el lint

## 3. Datos y configuración
- [ ] 3.1 `docker-compose.yml` local con PostgreSQL 16 y Valkey, con healthchecks
- [ ] 3.2 Prisma con `prismaSchemaFolder`, `schema.prisma` mínimo, `output` a `libs/db/src/generated`
- [ ] 3.3 Migración inicial: `CREATE EXTENSION IF NOT EXISTS citext;`
- [ ] 3.4 Configuración validada con Zod/class-validator en `apps/api` y `apps/worker`: el proceso no arranca sin `DATABASE_URL`, `REDIS_URL` y los secretos mínimos

## 4. Observabilidad mínima
- [ ] 4.1 Endpoint `/health` en `apps/api`: estado de Postgres, estado de Valkey, `commit` (SHA inyectado en build), `contractsVersion`
- [ ] 4.2 Latido del worker: escribe timestamp en Valkey cada 15s; `/health` lo expone

## 5. CI/CD
- [ ] 5.1 `ci.yml` con job `affected` (`nx show projects --affected`) usando `fetch-depth: 0` y `nrwl/nx-set-shas`
- [ ] 5.2 Jobs `lint-and-test` (con servicios Postgres + Valkey) y `e2e` condicionados a los proyectos afectados
- [ ] 5.3 Dockerfile multi-stage de imagen única (build de `api` y `worker`, runtime no-root)
- [ ] 5.4 `fly.toml` con dos process groups (`api`, `worker`); `worker` con `min_machines_running = 1`
- [ ] 5.5 `release.yml`: despliegue a Fly + verificación de SHA en `/health` + verificación de latido del worker
- [ ] 5.6 Despliegue de `agent-console` y `widget` a Cloudflare Pages (dos proyectos de Pages distintos)

## Definición de terminado
- [ ] Un push a `main` despliega `api` y `worker` en Fly, ambos frontends en Pages
- [ ] `/health` responde con el SHA correcto y un latido de worker de menos de 60s
- [ ] Un commit que solo toca `apps/agent-console` NO dispara build/test de `apps/api` (verificar en los logs de `nx affected`)
