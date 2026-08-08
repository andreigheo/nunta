# Controlled Beta Operations runbook

## Provision

1. Obtain explicit domain, provider, Git and credential authority.
2. Create dedicated beta PostgreSQL, Redis, private object storage and off-host backup destination.
3. Set database/storage identities to `controlled-beta`; create least-privilege app, migration and worker users.
4. Store dedicated secrets in the chosen secret manager; never copy local/test/staging/production values.
5. Configure valid TLS, private service networking, malware scanning, monitoring, tracing and routed alerts.
6. Run `pnpm verify:beta-environment`; resolve every blocker.
7. Run migrations and reference verification, then start API/worker/web.
8. Prove `/health`, `/ready`, authenticated routes, private metrics, tracing and alert delivery.
9. Run backup, isolated restore and rollback rehearsal.
10. Run full `pnpm verify:beta`, external smoke and bounded capacity suite.

## Start a cohort

Create program and cohort in `/admin/beta`; attach approved legal document versions; confirm exit/start checks; issue a single test invitation; accept with a real beta account; prove onboarding, feedback and support escalation; only then invite the bounded cohort. The token is disclosed once and is not present in database or idempotency evidence.

## Daily operation

- check system status, alerts, worker/outbox depth, provider health and backup;
- triage P0/P1 feedback and correlate with support/incidents;
- review consented product metrics without raw content or user-agent strings;
- update known issues and participant communication;
- revoke grants for departed participants.

## Incident response

P0: stop invitations, pause mutations/provider integration if needed, preserve audit evidence, notify accountable operators, assess data/security impact, choose rollback or hotfix, and do not resume until the full stop condition is closed. P1 follows the same record with an agreed response window. Never include secrets or raw personal content in alerts or tickets.

## Backup and restore

Require automated encrypted off-host backups, manifest/checksum, retention, alert-on-failure and periodic isolated restore. A successful backup command without a restored, verified database/object inventory is not proof.

## Stop / rollback

Pause program and invitations, revoke affected grants, enable maintenance/kill switch as scoped, deploy the last verified immutable release, run backward-compatible database steps only, verify identity/readiness and reconcile queued jobs. Record all actions in the release/incident evidence.
