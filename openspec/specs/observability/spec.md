# Observability Specification

## Purpose

Defines the minimum health-check surface needed to verify a deployment: `/health` on `apps/api`
and a heartbeat written to Valkey by `apps/api`'s in-process `HeartbeatService`.

## Requirements

### Requirement: Health Endpoint Contract

`apps/api` MUST expose a `GET /health` endpoint returning JSON with Postgres status, Valkey
status, the deployed commit SHA, and the age of the last heartbeat.

#### Scenario: Healthy dependencies report ok

- GIVEN Postgres and Valkey are both reachable
- WHEN a client calls `GET /health`
- THEN the response MUST return HTTP 200 with `db: "ok"` and `valkey: "ok"`

#### Scenario: Unreachable database reports degraded status

- GIVEN Postgres is unreachable
- WHEN a client calls `GET /health`
- THEN the response MUST return a non-200 status and `db` MUST NOT be `"ok"`

#### Scenario: Response includes commit SHA

- GIVEN the api image was built with a commit SHA injected at build time
- WHEN a client calls `GET /health`
- THEN the response body MUST include a `commit` field matching the deployed SHA

#### Scenario: Response includes heartbeat age

- GIVEN `apps/api`'s `HeartbeatService` has written a heartbeat timestamp to Valkey
- WHEN a client calls `GET /health`
- THEN the response body MUST include the heartbeat age in seconds

### Requirement: In-Process Heartbeat

`apps/api` MUST write a timestamp to Valkey, via an in-process `HeartbeatService`, at a fixed
interval of no more than 15 seconds while the process is running.

#### Scenario: Heartbeat is written periodically

- GIVEN `apps/api` has been running for at least 30 seconds
- WHEN the Valkey heartbeat key is inspected
- THEN its timestamp MUST be no older than 15 seconds

#### Scenario: Stale heartbeat is surfaced as unhealthy

- GIVEN `apps/api`'s `HeartbeatService` has stopped writing heartbeats
- WHEN `GET /health` is called and the heartbeat age exceeds 60 seconds
- THEN the response MUST return a non-200 status reflecting the stale heartbeat
