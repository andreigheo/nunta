# ADR 0054 — Observability, SLOs and alerting

Status: Accepted — 2026-07-21

## Decision

- API and worker emit structured JSON with service, environment, request/correlation/trace identifiers, safe route/job names, latency, status and safe error code.
- Trace context propagates through outbox message, consumer execution and BullMQ job. Tenant identifiers are hashed before use as attributes; bodies, prompts and SQL values are excluded.
- A bounded in-process metric registry exposes Prometheus text only on `/internal/metrics`, protected by a dedicated token and loopback/private-network check. Labels are closed and contain no raw IDs or PII.
- `GET /health` remains liveness. `GET /ready` reports critical dependencies. Platform `system-status` distinguishes healthy, degraded optional provider, disabled provider, maintenance and incomplete migrations.
- Alert rules are persisted/configured with severity, duration, dedupe key and runbook. A local sink records test alerts; production requires a configured sink.
- SLOs are initial targets with measurement and exclusions, not historical guarantees.

## Initial signals

Request count/latency/errors, auth and rate-limit failures, worker/job states, outbox backlog/age/dead letters, provider outcomes, storage scan/quarantine, database readiness and critical product failures are exposed with bounded cardinality.
