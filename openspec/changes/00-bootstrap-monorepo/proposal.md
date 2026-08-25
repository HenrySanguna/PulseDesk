# Proposal: Bootstrap Monorepo

## Intent
Necesitamos un monorepo Nx con los cinco proyectos base (dos frontends, API, worker, cuatro librerías) que compile, se testee de forma incremental con `nx affected` y se despliegue de extremo a extremo, antes de escribir ninguna lógica de dominio. Sin esto, cada fase posterior no tiene dónde vivir.

## Scope

**In scope**
- Workspace Nx con `apps/agent-console`, `apps/widget`, `apps/api`, `apps/worker`, `libs/contracts`, `libs/db`, `libs/sla-engine`, `libs/ui`.
- Etiquetas de proyecto y `@nx/enforce-module-boundaries` configurado según `project.md`.
- Configuración de entorno validada (falla el arranque si falta un secreto).
- Docker Compose local con PostgreSQL 16 y Valkey.
- Prisma configurado (`prismaSchemaFolder`) con migración inicial (`citext`).
- Endpoint `/health` con estado de BD, Valkey, `commit` (SHA) y latido del worker.
- Pipeline `ci.yml` con `nx affected`, `fetch-depth: 0` y `nx-set-shas`.
- Dockerfile de imagen única (api + worker) y `fly.toml` con dos process groups.
- Despliegue de `agent-console` y `widget` a Cloudflare Pages.

**Out of scope**
- Cualquier entidad de dominio (tickets, agentes, SLA). Este cambio no tiene modelo de negocio.
- Autenticación real (Fase 2).
- Cualquier UI más allá de una página de health-check.

## Approach
Generar el workspace con el preset integrado de Nx, añadir los proyectos vacíos con sus etiquetas de scope/type, configurar Prisma y Compose, y cerrar el ciclo completo de CI/CD contra una aplicación trivial. El objetivo no es tener nada útil todavía — es que el siguiente cambio (`add-sla-engine`) tenga un lugar sólido donde aterrizar sin arrastrar problemas de infraestructura.
