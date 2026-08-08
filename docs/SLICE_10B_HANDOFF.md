# Slice 10B handoff

Date: 2026-07-21

## Verdict

```text
NOT READY FOR BETA
NOT READY FOR PUBLIC LAUNCH
```

No Slice 11 work was started and the existing visual direction was preserved.

## Reference-data incident

The demonstrated cause was the integration harness using the persistent `weddingos` database and cleanup suites issuing broad truncation. E2E itself targets `weddingos_e2e`. The fix introduces durable database identity (`environment`, `databasePurpose`, `databaseInstanceId`), isolated preparation, cleanup guards, dedicated Redis databases, reference-data migrations, restricted delete/truncate grants and a security-definer readiness verifier that remains meaningful under forced RLS.

Persistent reference manifest after the repair: 7 platform roles, 6 legal documents and 6 published versions, 4 consent purposes, 40 retention policies, 40 retention rules and the required maintenance flag. Prisma reports 91 migrations and the schema is current after the final reference-health migration. The monolithic integration command exceeded its 15-minute execution ceiling after 29 passing tests; the remaining 9 were then run against a freshly prepared isolated database and passed, for 38/38 total scenarios. The persistent manifest was verified unchanged afterward.

## Admin security

Implemented real TOTP enrollment/confirmation, encrypted authenticator secrets with key ID, one-time hashed recovery codes, replay protection and purpose-bound step-up sessions. Critical platform mutations require step-up. The admin UI exposes enrollment, QR confirmation, recovery codes once and a step-up flow. Production secret storage and an independent browser E2E set are still required.

## Web security

Implemented an explicit session-bound CSRF token and unsafe-method middleware, frontend bootstrap/retry-once behavior, CORS headers and exemptions only for signed provider/guest flows. A central outbound HTTP helper rejects invalid schemes, credentials, private/reserved/metadata addresses and unsafe redirects with response limits. DNS resolution is validated, but socket-level DNS pinning/rebinding proof is still missing. Maintenance mode now blocks the configured scope while preserving health/status and signed webhook paths.

## Observability

Local Jaeger, OpenTelemetry Collector, Prometheus, Alertmanager and an HTTP receiver are loopback-bound and healthy. A critical probe was accepted by Alertmanager and delivered to the receiver. The API metrics route remains bearer-protected. Application OpenTelemetry instrumentation, API-to-outbox-to-worker trace continuation, SLO dashboards and a production receiver are not complete, so tracing is a blocker.

## Privacy

Privacy export is a real worker job producing a requester-bound ZIP artifact with manifest/checksums and without provider secrets. Executable retention dry-run/purge, deletion execution, shared-data preservation proof and legal-hold continuation are not complete and remain beta blockers.

## Backup and restore

The local tooling produces an encrypted PostgreSQL custom dump and encrypted object archive, checksums both, copies artifacts to a distinct filesystem destination, and restores DB plus objects to an explicit disposable target. The restore target is guarded and rewritten to `test/restore-target`; a rehearsal restored 100 object files and verified RLS plus representative counts without touching the source database. Automated scheduling, retention enforcement and a real off-host/object-provider destination are not implemented.

## Supply chain and release

Real artifacts exist for pnpm audit, licenses and CycloneDX 1.6 SBOM (1,097 components). The dependency scan found 1 low, 11 moderate, 6 high and 2 critical findings, so the release gate is blocked. Gitleaks was rerun against source-only paths and found zero secrets; generated build trees are excluded. Provenance is `SOURCE_SNAPSHOT_ONLY` because this folder is not a Git checkout; no commit was invented. The final 599-file source snapshot checksum is `79f4320e5288a0e9870d20eea7b6b89270b6d8656f85ea40d461ddbffc28df96`. The local staging-like Compose file validates structurally but has not completed deployment or rollback rehearsals.

## Verification matrix

```text
Format: passed (baseline verify)
Lint: passed (baseline verify)
Typecheck: passed (API, worker, web)
Unit: passed (226/226)
Integration: passed (38/38 across an isolated continuation; monolithic command timed out after 29)
E2E: failed gate (full post-change run: 230 passed and 3 demo-isolation failures; those exact 3 passed on a targeted remediation rerun; the 20 required closure scenarios and a single 253/0/0/0 run remain missing)
API build: passed
Worker build: passed
Frontend build: passed (69 routes)
Route smoke: passed
OpenAPI: passed (8 contract tests and Swagger Parser)
Database migrations: passed (91, current)
Reference integrity: passed after integration and after the full E2E run
MFA: passed unit/domain tests
Recovery codes: passed unit/domain tests
Step-up: passed unit/domain tests
CSRF: passed unit/domain tests
SSRF: failed gate (core validation passes; DNS rebinding pinning proof missing)
Maintenance: passed implementation and route smoke
Security detection: passed unit/integration implementation; complete closure E2E missing
Tracing: failed
Metrics: passed local protected scrape setup
Alert routing: passed local delivery probe
Privacy export: passed implementation/build; full E2E missing
Retention: failed
Deletion: failed
Database backup: passed local rehearsal
Object backup: passed local rehearsal
Backup verification: passed
Complete restore: passed local DB + 100-object disposable rehearsal
Security scan: failed gate (6 high, 2 critical)
Secret scan: passed after generated-tree exclusion
SBOM: passed
Release manifest: passed artifact creation; verdict BLOCKED
Staging-like deployment: failed (definition only)
Rollback: failed (not rehearsed)
Persistent runtime: passed
Restart recovery: passed
```

## Blockers

- End-to-end application tracing and production-grade dashboards/receiver.
- Retention, purge and deletion executors with legal-hold/shared-data proof.
- Socket-pinned SSRF/DNS rebinding protection proof.
- High/critical dependency findings.
- Required 20 closure E2E scenarios and a 253/0/0/0 gate.
- Staging-like deploy and rollback rehearsal.
- Automated backup schedule and genuinely off-host storage.
- Git provenance, external staging, production TLS/providers, legal and independent security reviews.
