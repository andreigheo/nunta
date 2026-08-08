# ADR 0056 — Release and deployment strategy

Status: Accepted — 2026-07-21

## Decision

- CI is a hard gate: locked install, formatting, lint, typecheck, unit, integration, migration validation, E2E with zero skips, OpenAPI, builds, dependency/secret/license scans, SBOM, checksums and release manifest.
- A `ReleaseCandidate` records build tool versions, migration list, OpenAPI/web/API/worker/SBOM checksums, exact test evidence, scan results, backup verification and approvals.
- Missing Git provenance is recorded as `INCOMPLETE`, never replaced with a fabricated commit. It blocks an unconditional production-ready verdict.
- Deployment is provider-neutral. Initial topology is a single hardened host with Caddy, private services and external/off-host backup; managed PostgreSQL/Redis/object storage are the scaling path. Kubernetes is not required.
- Migrations run once with the owner credential before application traffic. Runtime processes never receive the owner credential.
- Rollout is health-gated with drain/restart, smoke tests and an explicit rollback decision. Webhooks stay ingestible during application maintenance where safe.
- Development, test, staging and production use separate database, Redis, storage, encryption keys, provider credentials, cookie domains and feature-flag environments.

## Current verdict constraint

This checkout has no usable Git repository and no real staging/TLS/off-host backup/alert sink. Slice 10 may reach product-complete and controlled-beta readiness, but not unconditional public-launch readiness.
