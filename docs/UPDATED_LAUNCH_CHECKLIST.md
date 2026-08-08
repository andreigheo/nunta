# Updated launch checklist

Date: 2026-07-21

## Closed or locally proven

- [x] Root cause of persistent reference deletion demonstrated.
- [x] Dedicated persistent/integration/E2E/restore database identities.
- [x] Destructive test preparation fails closed on purpose mismatch.
- [x] Required reference manifest repaired through migration, not post-test manual seed.
- [x] TOTP enrollment, encrypted secret, recovery codes and purpose-bound step-up.
- [x] Explicit session-bound CSRF middleware and frontend token handling.
- [x] Central SSRF validation for scheme, address, redirect, size and content type.
- [x] Maintenance scopes enforced with public status and webhook exemptions.
- [x] Local Prometheus, Alertmanager, Jaeger, collector and receiver healthy.
- [x] Local Alertmanager delivery probe received.
- [x] Privacy export worker creates a bounded secure artifact.
- [x] Encrypted local DB + object backup and disposable complete restore.
- [x] Real audit, license, secret-scan and CycloneDX artifacts generated.
- [x] API, worker and 69-route frontend production builds.
- [x] Persistent systemd services enabled and recovered after deliberate restart.
- [x] Existing 233-scenario E2E suite executed post-change; three demo-isolation regressions were fixed and passed on an exact targeted rerun.

## Blocking controlled beta

- [ ] Add application OpenTelemetry instrumentation and prove API -> outbox -> worker trace without PII.
- [ ] Add retention dry-run and bounded purge executor.
- [ ] Add deletion executor with legal-hold and shared-data preservation behavior.
- [ ] Complete socket-pinned DNS rebinding defense and tests.
- [ ] Resolve or explicitly approved-pin all 6 high and 2 critical dependency findings.
- [ ] Add and pass at least 20 Slice 10B closure E2E scenarios.
- [ ] Produce the final `253 passed / 0 failed / 0 skipped / 0 retries` result.
- [ ] Run staging-like deployment and controlled rollback rehearsals.
- [ ] Configure automatic backup scheduling and retention.
- [ ] Configure a genuinely off-host backup destination with separate credentials.

## Blocking public launch

- [ ] Real Git commit/tag provenance and immutable release linkage.
- [ ] External staging environment and signed deployment evidence.
- [ ] Production domain and TLS.
- [ ] Production database, Redis, object storage and provider credentials.
- [ ] External monitoring and paging destination.
- [ ] Legal review of terms/privacy/cookies/payment/vendor documents.
- [ ] Independent security review and remediation sign-off.

Current gate: **BLOCKED — NOT READY FOR BETA / NOT READY FOR PUBLIC LAUNCH**.
