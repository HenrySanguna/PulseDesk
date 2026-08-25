# SDD Init Report — PulseDesk

**Topic key**: `sdd-init/PulseDesk`
**Modo de persistencia**: openspec (backend Engram no disponible en esta sesión)
**Fecha**: 2026-08-25
**Fase**: sdd-init (solo inicializacion, sin implementacion)

## Contexto del proyecto

Mesa de soporte omnicanal (chat en vivo, cola de tickets, SLAs con vencimiento
automatico). Segundo proyecto de portafolio full-stack senior; stack
deliberadamente distinto de CollabForge (ver tabla comparativa en
`openspec/project.md`).

**Estado real del repositorio**: no existe codigo fuente. No hay `package.json`,
`nx.json`, `go.mod`, directorios `apps/`/`libs/`, ni repositorio git inicializado.
Lo unico presente es el arbol de planificacion `openspec/` (`project.md` +
7 cambios propuestos, ninguno implementado).

## Stack detectado (derivado de `openspec/project.md`, no de introspeccion de codigo)

| Capa | Eleccion |
|---|---|
| Monorepo | Nx |
| Frontend | Angular 21 LTS, standalone, zoneless, Signals |
| Componentes UI | PrimeNG envuelto en `libs/ui` |
| Estado cliente | `@ngrx/signals` (SignalStore) |
| Backend | NestJS 11 sobre Fastify |
| ORM | Prisma 7 (`prismaSchemaFolder`, cliente en `libs/db/src/generated`) |
| Base de datos | PostgreSQL 16 |
| Tiempo real | Hibrido: SSE (dashboard/notificaciones) + `ws` nativo (chat/presencia) |
| Trabajos diferidos | BullMQ sobre Valkey |
| CI/CD | GitHub Actions con `nx affected` |
| Hosting | Fly.io (api + worker) + Cloudflare Pages (web + widget) + Neon |

## Arquitectura y convenciones

- Monorepo Nx: `apps/agent-console`, `apps/widget`, `apps/api`, `apps/worker`;
  `libs/contracts` (type:util), `libs/db` (type:data), `libs/sla-engine`
  (type:util), `libs/ui` (type:ui).
- Fronteras via `@nx/enforce-module-boundaries`: `scope:web` solo depende de
  web/shared; `scope:api`/`scope:worker` dependen de backend/shared, nunca entre
  si; `type:util` no depende de nada.
- TypeScript estricto, sin `any` ni `@ts-ignore`.
- `$queryRawUnsafe` prohibido; solo template tag `$queryRaw`, con interfaz de
  retorno manual y test de integracion que verifica la forma real.
- `server.emit()` global prohibido en el gateway `ws` — siempre a sala/canal.
- Todo job de BullMQ debe ser idempotente.
- Bloqueo optimista manual con columna `version` en `SlaClock` (Prisma no tiene
  `@VersionColumn`).
- Sesiones de agente: cookie httpOnly opaca + Valkey, revocable al instante.
  Tokens de widget: JWT firmado, efimero, con alcance a una conversacion.
- Restriccion transversal: coste cero (solo tiers gratuitos permanentes).

## Cambios planificados (no implementados, no modificados por esta fase)

| # | Cambio | Resumen |
|---|---|---|
| 00 | bootstrap-monorepo | Workspace Nx con 5 proyectos base + `nx affected` en CI |
| 01 | add-sla-engine | `libs/sla-engine`: reloj de SLA en horario laboral, funcion pura |
| 02 | add-dual-auth | Sesiones opacas (agentes) + JWT efimero (widget) |
| 03 | add-ticket-queue | Dominio de tickets via REST puro (CRUD, filtros, asignacion) |
| 04 | add-sla-jobs | `SlaClock` persistente + colas BullMQ (`sla`, `assignment`, `maintenance`) |
| 05 | add-realtime-hybrid | SSE (dashboard) + adaptador `ws` nativo (chat), sobre dual-auth |
| 06 | add-polish | Macros, graficos, colaboracion visible, accesibilidad, trazabilidad |

## Testing — capacidad detectada

**Strict TDD Mode**: `false` — no determinable aun, no existe codigo ni test
runner instalado. Se reevaluara automaticamente al completar
`00-bootstrap-monorepo` (que instala Vitest como parte del scaffold Nx).

**Detectado**: 2026-08-25

### Test runner

- Comando: no disponible (sin `package.json`)
- Framework planificado: Vitest (runner por defecto de Angular 21)

### Test layers (planificado, segun `project.md`)

| Layer | Available | Tool |
|---|---|---|
| Unit | ❌ (planificado) | Vitest |
| Integration | ❌ (planificado) | Testcontainers (Postgres + Valkey reales) |
| E2E | ❌ (planificado) | Playwright |

### Coverage

- Disponible: ❌
- Comando: — (politica planificada: `libs/sla-engine` requiere 100% de cobertura
  de ramas, por ser logica pura sin I/O)

### Quality tools

| Tool | Available | Command |
|---|---|---|
| Linter | ❌ (planificado, Nx ESLint) | — |
| Type checker | ❌ (planificado, `tsc --strict`) | — |
| Formatter | ❌ (planificado, Prettier via Nx) | — |

### Politica de testing no negociable (de `project.md`)

- Todo codigo con logica de negocio real lleva test unitario en la misma tarea
  que lo introduce, no despues.
- `libs/sla-engine`: cobertura de ramas al 100%.
- Todo job de BullMQ tiene test de idempotencia (ejecutarlo dos veces = un solo
  efecto).
- Toda consulta `$queryRaw` tiene test de integracion que verifica la forma
  real contra Postgres.
- Tests de integracion con Testcontainers reales, nunca mocks del ORM para
  logica con transacciones o bloqueo.

## Artefactos escritos por esta fase

- `openspec/config.yaml` (nuevo — contexto, reglas por fase, `tdd: false`)
- `openspec/changes/archive/` (directorio creado, vacio)
- `openspec/sdd-init-report.md` (este archivo)
- `.atl/skill-registry.md` (indice de skills disponibles)

No se creo, modifico ni toco ningun contenido dentro de
`openspec/changes/00-bootstrap-monorepo/` a `openspec/changes/06-add-polish/`.

## Riesgos y gaps detectados

- **No hay repositorio git inicializado.** No hay historial, no hay forma de
  revertir cambios ni de abrir PRs hasta correr `git init`.
- **No hay codigo fuente.** `strict_tdd` no es evaluable de verdad hasta que
  `00-bootstrap-monorepo` exista; el valor `false` es un placeholder, no una
  decision de politica de testing (la politica real, descrita arriba, ya exige
  TDD estricto para `sla-engine` y BullMQ).
- **No hay CI configurado.** GitHub Actions con `nx affected` esta solo en el
  plan (`00-bootstrap-monorepo`), no implementado.
- **`openspec/config.yaml` no existia antes de esta fase** — se creo desde cero;
  no habia riesgo de sobrescritura porque no habia version previa.
- Los 7 cambios estan secuenciados con dependencias fuertes (p. ej. `04` depende
  de `01`, `05` depende de `02`); cualquier fase futura que se salte el orden
  documentado en `project.md` deberia justificarlo explicitamente.
