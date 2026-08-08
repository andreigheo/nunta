# Secrets rotation runbook

## Scope

Rotate one secret family at a time: session signing, MFA encryption, outbox envelope encryption, database credentials, object storage credentials, provider webhook/signing secrets, SMTP credentials, metrics token and backup encryption keys. Record operator, reason, start/end time and evidence in the platform audit trail or deployment record.

## Standard procedure

1. Create a new secret version in the environment secret manager; never print it to logs or commit it.
2. For versioned encryption, retain the old decrypt key and set a new active key ID. MFA and outbox records must remain decryptable during the migration window.
3. Deploy readers with both old and new keys, then switch writers to the new key ID.
4. Re-encrypt or naturally roll records and verify old-key usage reaches zero.
5. Rotate dependent provider/database credentials and restart API and worker in a controlled order.
6. Verify `/ready`, a real authenticated read, one safe mutation, worker heartbeat, webhook verification and metrics scrape.
7. Revoke the old credential only after verification and the documented retention window.
8. Update the release/deployment evidence without storing the secret value.

## Emergency compromise

Suspend affected provider integration or enable the narrowest maintenance scope, revoke the compromised credential, rotate immediately, invalidate related sessions/tokens, inspect security events and create an incident. For session-secret compromise, revoke all sessions. For backup-key compromise, produce a new encrypted backup under a new key and apply the retention policy to old artifacts.

## Local limitation

The persistent local units contain development-only placeholder secrets. This runbook does not turn those values into production-safe secrets, and no production secret-manager integration is claimed.
