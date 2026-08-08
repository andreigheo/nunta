# ADR 0052 — Retention, legal hold and purge

Status: Accepted — 2026-07-21

## Decision

- Retention periods are data in versioned `DataRetentionPolicy` rules, scoped by environment and allowlisted entity type. They are not scattered constants.
- `LegalHold` targets an allowlisted user, workspace, vendor, booking, contract, payment, payout, document or support case. Active holds block purge, not normal access.
- Hold creation and release require a reason, version, platform capability and append-only admin action. Override uses the higher `platform.privacy.override_hold` capability.
- Retention scanning, deletion planning and purge are bounded durable executions with cursor, dry-run preview, idempotency key, counts and redacted errors.
- The worker uses the application/worker database role and closed entity handlers. It never accepts arbitrary table names and never uses the database owner.
- Shared financial, contractual and audit records are anonymized or tombstoned according to policy instead of being cascade-deleted.

## Initial policy

The migration seeds policy definitions for short-lived sessions/tokens, generated artifacts, provider events, notifications/activity, support, operational media, audit and financial evidence. Values are configuration defaults subject to legal review; they do not claim universal legal sufficiency.
