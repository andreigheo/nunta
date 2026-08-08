# WeddingOS Slice 10 implementation plan

Date: 2026-07-21  
Status: In progress

## Initial gate evidence

- The empty `20260720214500_public_marketing_revocation_safety_gate` directory was factually reconstructed from its original local execution evidence. Its DDL had already been consolidated into `20260720213000_public_product_proof_hardening`; the restored migration therefore verifies the exact table, index, RLS policies and grants without duplicating objects.
- Both `weddingos` and `weddingos_e2e` report 83 migrations and an up-to-date schema.
- `pnpm verify` passed: formatting, lint, typecheck, 194 unit tests, 38 integration tests and all builds.
- Existing browser baseline passed: 198 application E2E, five landing fallback E2E and one full-stack landing proof. A stale Next fetch-cache fixture was isolated with a per-run cache namespace.
- PostgreSQL, Redis, Mailpit, MinIO and ClamAV are healthy. API, worker and web systemd user services are active, enabled, `Restart=always` and loopback-bound. API readiness reports database, Redis, worker and outbox healthy.

## Audit findings

- `/admin` contains simulated counts, incidents, maintenance and mutation toasts. `/admin/trust` is the only real platform surface and uses Slice 7 capability grants.
- There is no `/settings/privacy`, `/privacy`, `/terms` or `/cookies` canonical route; Romanian legacy legal routes exist but are static and unversioned.
- Consent is limited to accepted terms fields and a marketing boolean. There is no DSAR, deletion plan, legal hold, retention execution or privacy export workflow.
- There is no persistent feature flag, maintenance window, support case, platform incident, security alert, backup, restore or release-candidate model.
- Health/readiness exist; internal metrics, traces, alert sink and platform system status do not.
- Configuration is typed but local/fake provider defaults, inline systemd development secrets and missing production-only requirements prevent a production claim.
- All published infrastructure ports are loopback. No reverse proxy/TLS/staging configuration is present.
- Provider webhooks exist for email, payment, signature, subscription and payout; they require signature handling, but global body limits, CSRF exclusion documentation and operational alert projection need consolidation.
- Files under local artifact/import roots demonstrate the need for active retention cleanup and managed backup; they are not production storage.
- CI lacks migration shadow validation, the isolated landing proof, vulnerability/secret/license scans, SBOM, release manifest and restore-freshness gate.
- Parent `.git` is empty. Commit provenance and Git rollback are unavailable.

## Proposed persistent models

Platform:

- `PlatformRole`, `PlatformGrant`, `PlatformAdminAction`
- `PlatformSupportCase`, `PlatformSupportNote`
- `PlatformIncident`, `PlatformFeatureFlag`, `PlatformMaintenanceWindow`

Privacy and retention:

- `LegalDocument`, `LegalDocumentVersion`, `UserConsentRecord`, `ConsentWithdrawal`, `CookiePreference`
- `DataSubjectRequest`, `DeletionRequest`, `DeletionPlan`, `DeletionExecution`, `DeletionTombstone`
- `DataRetentionPolicy`, `LegalHold`, `RetentionExecution`

Security, backup and release:

- `SecurityEvent`, `SecurityAlert`
- `BackupRun`, `BackupArtifact`, `BackupVerification`
- `RestoreRun`, `RestoreValidation`
- `ReleaseCandidate`, `ReleaseApproval`

Secondary histories and affected-service/rule details use bounded JSON in this slice unless they need independent lifecycle or RLS. They are not generic arbitrary-code containers.

## Migration plan

1. `20260720214500_public_marketing_revocation_safety_gate`: historical verification reconciliation, already applied.
2. `20260721100000_platform_privacy_and_operations`: enums, models, indexes, constraints, grants, forced RLS, platform helper functions and seed roles/policies.
3. `20260721101500_platform_runtime_guards`: narrow admin/worker functions, append-only protections and default retention/legal documents.

Both migrations must apply cleanly to `weddingos` and `weddingos_e2e` and from an empty shadow database.

## Platform roles and capabilities

The seven ADR 0050 roles are seeded with explicit reviewed capability arrays. Existing Slice 7 trust/subscription/settlement/payout capabilities are mapped into the relevant roles. No role is assigned automatically. Local test seeding grants a dedicated admin account only.

## Privacy flows

- Consent: list immutable purposes/history, record optional grant, append withdrawal.
- Cookies: essential fixed on; preferences/analytics/marketing explicit, optional off by default, reopenable from the footer/settings.
- DSAR: submit idempotently, verify, review holds/shared records, process, produce artifact/action and complete.
- Export: async requester-bound ZIP manifest through `GeneratedArtifact`, bounded and expiring.
- Deletion: verified request, impact preview, grace period, legal-hold/shared-data evaluation, soft disable, allowlisted purge and tombstone.

## Retention and legal hold

Versioned policies cover auth, audit, provider events, documents/artifacts, Copilot, notifications/activity, check-in/media, support and financial evidence. Scans are bounded, dry-run capable and cursor based. Active legal holds block archive/purge and require higher capability plus reason to release.

## Security baseline

- Origin-bound CSRF for production cookie mutations; signed webhooks excluded.
- Exact CORS, secure production cookies, CSP/frame/content/referrer/permissions headers and production HSTS template.
- Body/time/redirect limits, login throttling and shared SSRF validation.
- Production startup rejects local/fake secrets, insecure Redis/storage/provider configuration, missing metrics/backup keys and environment mismatch.
- Sensitive admin actions require reason, recent authentication, capability and MFA gate.

## Observability and alerts

Structured redacted logs and trace/correlation propagation cover API, worker, outbox, jobs, provider/storage/scan calls. `/internal/metrics` is token plus network protected. Platform system status exposes only approved aggregates. Persisted/deduped critical and warning alerts link to runbooks and a local fake sink.

## Backup and restore

Local backup produces a real custom-format database dump plus object/config/migration inventory, checksums and encrypted managed artifacts. Restore targets a disposable database/namespace, then runs migration, RLS, integrity, object and representative-domain validation. Production restore remains approval and maintenance gated. Off-host destination is a launch condition.

## Deployment and CI/CD

Add a provider-neutral Caddy template, staging/production environment reference, deployment/DR/secret-rotation runbooks, SLOs, SBOM and release-manifest scripts. CI gets locked verification, migration clean-room validation, all browser suites, OpenAPI, scans, SBOM/checksums and restore-freshness gate.

## Frontend

Preserve the current tokens, primitives, spacing, typography and portal shell. Replace mock admin successes with live states and add real `/admin/*`, `/settings/privacy`, `/privacy`, `/terms` and `/cookies` routes. Destructive actions show reason, impact, confirmation and conflict/error states. The environment and `Platform Admin` identity remain visible.

## Test plan

- Unit: capability resolution, status machines, consent history, feature hashing, retention/hold rules, redaction, SSRF, metrics cardinality, manifest/checksum and backup validation.
- Integration: persisted grants, suspension/session revoke, support, flags, maintenance, DSAR/export/deletion/hold, alert dedupe, backup/restore, platform isolation and concurrent stale writes.
- E2E: the 25 mandatory Slice 10 scenarios, zero skipped/retries, while preserving the existing 204 baseline.
- Gate: format, lint, typecheck, unit, integration, app E2E, landing fallback/proof, API/worker/web builds, route smoke, OpenAPI, migration status, backup/restore drill and permanent-server recovery.

## Exact implementation order

1. Reconcile migration history and baseline (complete).
2. Add platform/privacy/security/backup/release schema and forced RLS.
3. Add platform capability guard, roles/grants and append-only admin action evidence.
4. Implement admin, support, feature flag, maintenance, incident and system-status APIs.
5. Implement consent, cookie, DSAR, export, deletion, retention and legal-hold APIs/workers.
6. Implement security headers, CSRF/origin checks, SSRF guard, configuration validation, redaction, metrics and alerts.
7. Implement real local backup, disposable restore verification and release manifest.
8. Connect admin/privacy/legal frontend without redesign.
9. Complete OpenAPI, registries, CI/runbooks and the 25 E2E.
10. Run the final gate, sync the Linux runtime, migrate, restart all permanent services and prove authenticated/manual HTTP behavior.

## Honest launch constraint

The intended Slice 10 verdict is `PRODUCT COMPLETE` plus `READY FOR CONTROLLED BETA` if all local gates pass. `NOT READY FOR PUBLIC LAUNCH` remains mandatory until Git provenance, staging, TLS, real provider credentials, off-host encrypted backup, alert delivery, legal review and an observed restore drill exist.
