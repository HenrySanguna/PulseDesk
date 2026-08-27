# CI/CD Pipeline Specification

## Purpose

Defines the GitHub Actions CI pipeline (`nx affected`-driven) and the release pipeline that
builds a single Docker image for `api` and deploys both frontends to Cloudflare Pages.

## Requirements

### Requirement: Affected-Only CI

The CI pipeline MUST compute affected projects using `nx affected` with `fetch-depth: 0` and a
base/head SHA resolution step, and MUST run lint/test/e2e jobs only for affected projects.

#### Scenario: Change scoped to one frontend skips backend jobs

- GIVEN a commit only modifies files under `apps/agent-console`
- WHEN the CI workflow runs
- THEN the `api` project MUST NOT appear in the affected project list

#### Scenario: Shared lib change affects all consumers

- GIVEN a commit modifies `libs/contracts`
- WHEN the CI workflow runs
- THEN every project depending on `libs/contracts` MUST appear in the affected project list

#### Scenario: Full git history is available for affected detection

- GIVEN the CI checkout step runs
- WHEN `fetch-depth: 0` is configured
- THEN `nx affected` MUST be able to resolve the correct base/head comparison without error

### Requirement: Single-Image Backend Build

The repository MUST provide a multi-stage Dockerfile that builds `apps/api` into one image,
running as a non-root user.

#### Scenario: Image serves the api process

- GIVEN the Docker image is built
- WHEN inspecting the image contents
- THEN it MUST contain a runnable entrypoint for the `api` process

#### Scenario: Container runs as non-root

- GIVEN the image is built
- WHEN the container starts
- THEN the running process MUST NOT be UID 0

### Requirement: Render Deployment via Deploy Hook

The release pipeline MUST trigger a deploy of the single image to a Render web service by calling
its Deploy Hook URL, gated by `nx affected` so it only fires when `api` is affected.

#### Scenario: Deploy hook fires only when api is affected

- GIVEN a release commit does not touch `apps/api` or any of its dependencies
- WHEN the release pipeline runs
- THEN the Render Deploy Hook MUST NOT be called

#### Scenario: Post-deploy verification confirms live SHA

- GIVEN a release has triggered a Render deploy
- WHEN the pipeline calls `GET /health` on the deployed api
- THEN the returned `commit` field MUST match the SHA being released

### Requirement: Cloudflare Pages Deployment for Both Frontends

The release pipeline MUST deploy `apps/agent-console` and `apps/widget` as two separate
Cloudflare Pages projects.

#### Scenario: Agent console deploys independently

- GIVEN only `apps/agent-console` is affected by a release
- WHEN the release pipeline runs
- THEN the `agent-console` Pages project MUST be updated and the `widget` Pages project MUST NOT
  be redeployed

#### Scenario: Widget deploys to its own project

- GIVEN a change affecting `apps/widget`
- WHEN the release pipeline runs
- THEN the build output MUST be published to the `widget` Cloudflare Pages project distinct from
  `agent-console`
