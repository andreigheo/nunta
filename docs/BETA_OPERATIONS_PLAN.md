# Controlled Beta Operations plan

## Objective

Operate a small invitation-only beta without expanding the product surface. The operational loop is: define program → define bounded cohort → issue hashed invitation → collect explicit consent → activate participant → collect privacy-safe product events and feedback → triage/support → evaluate factual exit criteria.

## Environment topology

The external topology is provider-neutral and remains unprovisioned: valid TLS reverse proxy, web, API, worker, dedicated PostgreSQL, dedicated Redis, private object storage, malware scanner, monitoring, tracing, routed alerts, off-host encrypted backup, transactional email and sandbox commerce providers. See `ops/beta/external.env.example`.

Persistent identity must be:

```text
environment=beta
databasePurpose=controlled-beta
storagePurpose=controlled-beta
```

Startup fails closed when identity, release, HTTPS endpoints, credentials, encryption, SMTP, storage or external operational destinations are missing or contain local/test/staging markers.

## Cohort sequence

1. Create a DRAFT program with a real release identifier and reviewed document versions.
2. Define target counts per participant type and a bounded start/end window.
3. Confirm providers, alerts, backup and restore before changing program status.
4. Invite only named participants. Persist email and token only as SHA-256 hashes; display the token once.
5. Require beta terms, privacy notice and limitations acknowledgement. Analytics remains optional.
6. Complete onboarding and activate the access grant.
7. Review feedback, support, incidents, reliability and product metrics daily.
8. Remove participants atomically by revoking the grant; retain only under documented retention/legal-hold rules.

## Cadence

- Daily: P0/P1 triage, provider health, alert route and backup result.
- Twice weekly: cohort activation/value/reliability review and known-issues update.
- Weekly: patch release window and exit-criteria review.
- Any time: P0 hotfix under change control, with rollback and participant communication.

No invitation may be sent while the final verdict is `CONTROLLED BETA BLOCKED`.
