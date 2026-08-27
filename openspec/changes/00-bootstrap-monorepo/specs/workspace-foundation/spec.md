# Workspace Foundation Specification

## Purpose

Defines the Nx monorepo structure — the base apps/libs, their tagging, and the dependency
boundaries that keep `scope:web`, `scope:api`, and `type:util` code isolated from
each other before any domain logic exists.

## Requirements

### Requirement: Nx Workspace Layout

The workspace MUST contain exactly these projects: `apps/agent-console`, `apps/widget`,
`apps/api`, `libs/contracts`, `libs/db`, `libs/sla-engine`, `libs/ui`.

#### Scenario: Listing all projects

- GIVEN a freshly bootstrapped workspace
- WHEN running `nx show projects`
- THEN the output contains all seven project names and no domain-specific projects

#### Scenario: API uses Fastify adapter

- GIVEN `apps/api` is generated as a NestJS application
- WHEN the app bootstraps
- THEN it MUST use `@nestjs/platform-fastify`, not Express

### Requirement: Project Tagging

Every project MUST declare `scope:*` and `type:*` tags in its `project.json` matching its role
(`scope:web`, `scope:api`, `scope:shared`; `type:app`, `type:util`, `type:data`,
`type:ui`).

#### Scenario: Frontend apps tagged as web

- GIVEN `apps/agent-console` and `apps/widget`
- WHEN inspecting their `project.json`
- THEN both declare `scope:web` and `type:app`

#### Scenario: Pure libs tagged as util

- GIVEN `libs/contracts` and `libs/sla-engine`
- WHEN inspecting their `project.json`
- THEN both declare `type:util`

### Requirement: Dependency Boundary Enforcement

The workspace MUST enforce `@nx/enforce-module-boundaries` lint rules so that `scope:web` code
cannot depend on `scope:api` code, and `type:util` projects cannot depend on any other project.

#### Scenario: Illegal cross-scope import fails lint

- GIVEN `apps/agent-console` adds an import from `libs/db`
- WHEN running `nx lint agent-console`
- THEN the lint MUST fail with a module-boundary violation

#### Scenario: Legal shared import passes lint

- GIVEN `apps/api` imports a type from `libs/contracts`
- WHEN running `nx lint api`
- THEN the lint MUST pass with no boundary violations

#### Scenario: Pure util lib stays dependency-free

- GIVEN `libs/sla-engine` adds an import from `libs/db`
- WHEN running `nx lint sla-engine`
- THEN the lint MUST fail with a module-boundary violation
