# WeddingOS disaster recovery runbook

Status: operational draft for controlled beta. RPO/RTO are targets, not guarantees.

## Targets and owners

- Target RPO: 24 hours until an automated, encrypted, off-host schedule is proven; desired production target is 1 hour.
- Target RTO: 8 hours for the current single-host topology; desired production target is 2 hours.
- Incident commander: on-call Platform Operations. Security and Privacy owners join for suspected compromise or personal-data impact.
- Dependencies: PostgreSQL, Redis/BullMQ, private object storage, ClamAV, mail provider, payment/signature/subscription/payout providers, DNS/TLS and the encryption-key archive.

## Declaration and containment

1. Open a platform incident, record detection time, scope and decision owner. Use a separate communications channel if the application is affected.
2. Preserve logs, provider event IDs and audit trails. Never paste secrets or raw provider payloads into the incident.
3. Stop web/API mutations and workers in that order when continued writes can increase damage. Keep webhook ingress buffering only if its durable dedupe store is healthy.
4. Select the latest verified backup before the incident boundary. Confirm checksum, key ID, PostgreSQL compatibility and migration inventory.

## Restore and validation

1. Restore into a new isolated database and object prefix. Never restore first over the active production target.
2. Run migration status, FK/unique checks, forced-RLS checks, representative row counts and object checksum validation.
3. Verify one representative account/workspace, document relationship, payment ledger, guest/check-in record, outbox state and Copilot/risk record without exposing contents in logs.
4. Start API and worker against the isolated target. Run health, readiness, route smoke and replay-safe outbox checks.
5. Obtain explicit restore approval. Record evidence in `RestoreValidation` and link it to the incident.

## Cutover and recovery

1. Pause providers or retain their webhooks in a durable queue during DNS/traffic cutover.
2. Route traffic to the validated target, then resume dispatcher and workers. Existing provider event IDs and outbox consumer executions prevent intentional duplicates; external delivery remains at-least-once.
3. Observe error rate, queue age, dead letters and provider reconciliation. Roll back traffic if acceptance thresholds fail; do not write to both primaries.
4. State the measured data-loss window to affected stakeholders. Complete a post-incident review within five business days and update the runbook.

The repository proves only a local disposable restore. Off-host backup, external alert delivery, DNS cutover and production credentials remain deployment gates.
