# PulseDesk — Project Constitution

> Este archivo se inyecta en cada propuesta, spec, diseño y tarea que genere el agente. Son las restricciones no negociables del proyecto. Si un artefacto contradice algo de aquí, el artefacto está mal, no este archivo.

## Qué es PulseDesk

Mesa de soporte omnicanal con chat en vivo, cola de tickets y SLAs con vencimiento automático. Segundo proyecto de un portafolio full-stack senior — el primero (CollabForge) usó Socket.IO, TypeORM y dos repositorios separados; PulseDesk usa deliberadamente un stack distinto para demostrar rango técnico, no porque el anterior estuviera mal.

## Stack (no negociable sin nueva propuesta)

| Capa | Elección | No usar |
|---|---|---|
| Monorepo | Nx | Repos separados, npm workspaces sin Nx |
| Frontend agentes | Angular 21 LTS, standalone, zoneless, Signals | NgModules, Zone.js, Angular Material |
| Componentes UI | PrimeNG, envuelto en `libs/ui` | PrimeNG importado directo en `apps/web` |
| Estado cliente | `@ngrx/signals` (SignalStore) | NgRx clásico (actions/reducers/effects), signals a mano sin estructura |
| Backend | NestJS 11 sobre **Fastify** (no Express) | Express |
| ORM | **Prisma 7**, `prismaSchemaFolder`, cliente en `libs/db/src/generated` | Drizzle, TypeORM |
| Base de datos | PostgreSQL 16 | MySQL, MongoDB |
| Tiempo real | **Híbrido**: SSE (`Observable` de Nest) para dashboard/notificaciones unidireccionales; `ws` nativo con adaptador propio para chat/presencia bidireccional | Socket.IO |
| Trabajos diferidos | BullMQ sobre Valkey | Cron a pelo, Redis (licencia no libre desde 2024) |
| Testing unitario | **Vitest** (runner por defecto de Angular 21) | Karma, Jasmine |
| Testing de integración | **Testcontainers** (Postgres + Valkey reales por suite) | Mocks de base de datos, SQLite en memoria |
| Testing E2E | Playwright | Cypress |
| CI/CD | GitHub Actions con `nx affected` | Filtros de ruta manuales en YAML |
| Hosting | Fly.io (api + worker, dos process groups) + Cloudflare Pages (web + widget) + Neon | Cualquier infraestructura de pago |

**Restricción transversal: coste cero.** Todo el stack es open source; toda la infraestructura usa tiers gratuitos permanentes. Si una propuesta requiere gasto, debe decirlo explícitamente y justificarlo.

## Estructura del monorepo

```
apps/
  agent-console/   Angular 21 · PrimeNG · SignalStore — consola de agentes
  widget/          Angular 21 minimalista — embebible en sitios de clientes
  api/             NestJS 11 · Fastify — HTTP + SSE + ws
  worker/          NestJS standalone — consumidores de BullMQ
libs/
  contracts/       DTOs, eventos SSE/ws, tipos compartidos (type:util, sin dependencias)
  db/               esquema Prisma + PrismaService + queries crudas tipadas (type:data)
  sla-engine/       cálculo de SLA con horario laboral — función pura, sin I/O (type:util)
  ui/               componentes propios que envuelven PrimeNG (type:ui)
```

Fronteras de dependencia obligatorias (`@nx/enforce-module-boundaries`):
- `scope:web` solo puede depender de `scope:web` y `scope:shared`.
- `scope:api` y `scope:worker` pueden depender de `scope:backend` y `scope:shared`, nunca entre sí.
- `type:util` (contracts, sla-engine) no puede depender de nada. Deben quedar puras.

## Convenciones de código

- **TypeScript estricto**, sin `any`, sin `@ts-ignore`.
- **Prisma**: `$queryRawUnsafe` prohibido — solo template tag `$queryRaw`. Todo SQL crudo vive en `libs/db/src/queries/` con su interfaz de retorno declarada a mano y un test de integración que verifica la forma real.
- **`server.emit()` global prohibido** en el gateway `ws`: siempre dirigido a una sala/canal específico.
- **Todo trabajo de BullMQ debe ser idempotente.** Un consumidor puede ejecutarse dos veces; el efecto debe ser el mismo que ejecutarse una vez.
- **Bloqueo optimista manual** en `SlaClock` vía columna `version` — Prisma no tiene `@VersionColumn`. El `where` de cualquier update sobre un reloj de SLA debe incluir `version`.
- **Sesiones de agente**: opacas en cookie httpOnly + Valkey, revocables al instante. **Tokens de widget**: JWT firmado, efímero, con alcance a una sola conversación. No usar JWT para agentes (a diferencia de CollabForge): `EventSource` no admite cabeceras personalizadas, así que el transporte exige cookie.

## Testing — no negociable

- Todo código con lógica de negocio real lleva test unitario en la misma tarea que lo introduce, no después.
- `libs/sla-engine`: cobertura de ramas al 100%. Es lógica pura sin I/O — no hay excusa.
- Todo trabajo de BullMQ tiene un test que verifica idempotencia (ejecutarlo dos veces produce un solo efecto).
- Toda consulta con `$queryRaw` tiene un test de integración que verifica que la forma declarada coincide con el resultado real de Postgres.
- Los tests de integración usan Testcontainers (Postgres + Valkey reales), nunca mocks del ORM para lógica que involucra transacciones o bloqueo.

## Qué NO se repite de CollabForge (contexto para no "corregir" estas diferencias)

Estas diferencias son intencionadas y no deben "armonizarse" con el otro proyecto:

| Dimensión | CollabForge | PulseDesk |
|---|---|---|
| ORM | TypeORM | Prisma |
| Tiempo real | Socket.IO | SSE + `ws` nativo |
| Auth | JWT + refresh rotativo | Sesiones opacas (agentes) + token efímero (widget) |
| Concurrencia | Bloqueo pesimista/optimista con `@VersionColumn` | Actualización condicional + `version` manual |
| Testing unitario | Karma | Vitest |
| Repositorio | Dos repos + contratos por Git | Nx monorepo |

## Fuente de la verdad

Estos artefactos OpenSpec se derivaron de una especificación previa en 11 documentos markdown (`00-overview.md` a `10-roadmap.md`), que contienen el razonamiento completo, los ADRs y las secciones de "Decisiones y trade-offs" con más detalle del que cabe aquí. Ante cualquier ambigüedad no cubierta por un `spec.md`, esos documentos son la referencia — pídelos si hace falta profundizar en un punto concreto antes de implementar.
