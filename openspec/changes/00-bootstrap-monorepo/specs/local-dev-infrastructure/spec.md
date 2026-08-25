# Local Development Infrastructure Specification

## Purpose

Defines the local Docker Compose stack, Prisma schema/migration setup, and startup environment
validation that `apps/api` and `apps/worker` depend on before any domain logic exists.

## Requirements

### Requirement: Docker Compose Local Stack

The repository MUST provide a `docker-compose.yml` that starts PostgreSQL 16 and Valkey, each
with a healthcheck, for local development.

#### Scenario: Postgres becomes healthy

- GIVEN `docker compose up -d` is run
- WHEN the Postgres container's healthcheck is queried
- THEN it MUST report `healthy` within a bounded startup window

#### Scenario: Valkey becomes healthy

- GIVEN `docker compose up -d` is run
- WHEN the Valkey container's healthcheck is queried
- THEN it MUST report `healthy` within a bounded startup window

#### Scenario: Dependent services wait for health

- GIVEN `apps/api` is configured to depend on the compose services
- WHEN the compose stack starts
- THEN the api service MUST NOT be marked ready until both dependencies report healthy

### Requirement: Prisma Schema and Migration Setup

The workspace MUST configure Prisma with `prismaSchemaFolder`, generate the client into
`libs/db/src/generated`, and include an initial migration enabling the `citext` extension.

#### Scenario: Client generates to the shared lib

- GIVEN the Prisma schema is compiled
- WHEN running the Prisma generate command
- THEN the client output MUST be written under `libs/db/src/generated`

#### Scenario: Initial migration enables citext

- GIVEN a fresh database with no applied migrations
- WHEN running `prisma migrate deploy`
- THEN the migration history MUST include a step running
  `CREATE EXTENSION IF NOT EXISTS citext;`

#### Scenario: Migration is idempotent on re-run

- GIVEN the initial migration has already been applied
- WHEN `prisma migrate deploy` is run again
- THEN it MUST complete without error and without re-creating the extension

### Requirement: Fail-Fast Environment Validation

`apps/api` and `apps/worker` MUST validate required environment variables at startup and MUST
refuse to start the process if any required variable is missing or malformed.

#### Scenario: Missing DATABASE_URL blocks startup

- GIVEN `DATABASE_URL` is unset
- WHEN `apps/api` attempts to bootstrap
- THEN the process MUST exit with a non-zero code before accepting any connections

#### Scenario: Missing REDIS_URL blocks worker startup

- GIVEN `REDIS_URL` is unset
- WHEN `apps/worker` attempts to bootstrap
- THEN the process MUST exit with a non-zero code before starting any BullMQ consumer

#### Scenario: All required variables present allows startup

- GIVEN `DATABASE_URL`, `REDIS_URL`, and all minimum required secrets are set and well-formed
- WHEN `apps/api` bootstraps
- THEN the process MUST start successfully
