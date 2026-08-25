# CI/CD Pipeline Specification

## Purpose

Defines the GitHub Actions CI pipeline (`nx affected`-driven) and the release pipeline that
builds a single Docker image for `api`+`worker` and deploys both frontends to Cloudflare Pages.

## Requirements

### Requirement: Affected-Only CI

The CI pipeline MUST compute affected projects using `nx affected` with `fetch-depth: 0` and a
base/head SHA resolution step, and MUST run lint/test/e2e jobs only for affected projects.

#### Scenario: Change scoped to one frontend skips backend jobs

- GIVEN a commit only modifies files under `apps/agent-console`
- WHEN the CI workflow runs
- THEN the `api` and `worker` projects MUST NOT appear in the affected project list

#### Scenario: Shared lib change affects all consumers

- GIVEN a commit modifies `libs/contracts`
- WHEN the CI workflow runs
- THEN every project depending on `libs/contracts` MUST appear in the affected project list

#### Scenario: Full git history is available for affected detection

- GIVEN the CI checkout step runs
- WHEN `fetch-depth: 0` is configured
- THEN `nx affected` MUST be able to resolve the correct base/head comparison without error

### Requirement: Single-Image Backend Build

The repository MUST provide a multi-stage Dockerfile that builds both `apps/api` and
`apps/worker` into one image, running as a non-root user.

#### Scenario: One image serves both process groups

- GIVEN the Docker image is built
- WHEN inspecting the image contents
- THEN it MUST contain runnable entrypoints for both the `api` and `worker` processes

#### Scenario: Container runs as non-root

- GIVEN the image is built
- WHEN the container starts
- THEN the running process MUST NOT be UID 0

### Requirement: Fly.io Deployment with Two Process Groups

The release pipeline MUST deploy the single image to Fly.io with two process groups, `api` and
`worker`, where `worker` keeps at least one machine running at all times.

#### Scenario: Both process groups deploy from one release

- GIVEN `fly deploy` runs against `fly.toml`
- WHEN the deployment completes
- THEN both the `api` and `worker` process groups MUST be running

#### Scenario: Worker never scales to zero

- GIVEN the `worker` process group configuration
- WHEN Fly evaluates autoscaling
- THEN `min_machines_running` for `worker` MUST be at least 1

#### Scenario: Post-deploy verification confirms live SHA

- GIVEN a release has been deployed
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
