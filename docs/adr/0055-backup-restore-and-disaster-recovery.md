# ADR 0055 — Backup, restore and disaster recovery

Status: Accepted — 2026-07-21

## Decision

- `BackupRun`, `BackupArtifact` and `BackupVerification` describe database, object inventory, migration/config manifest, checksums, encryption key ID, size, expiry and outcome.
- Local database backup uses `pg_dump --format=custom` into a managed root, then checksum and authenticated encryption. Credentials are provided through environment, never command arguments or logs.
- Object backup is a private inventory manifest with object key hashes, versions/checksums and relationships. Off-host transfer remains provider-adapter responsibility.
- Restore defaults to an isolated disposable database and object namespace. Active production restore requires maintenance mode, recent auth, capability, reason and an approval distinct from the requester.
- Verification checks migration status, FK/RLS/unique constraints, representative domain records, object checksums, dedupe/outbox consistency and smoke operations.
- RPO/RTO in the runbook are targets dependent on deployment topology, not guarantees.

## Consequences

Local acceptance can prove backup and disposable restore. Public production readiness still requires an encrypted off-host destination and a recent observed restore drill.
