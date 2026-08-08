# ADR 0013: Guest and household domain

- Status: Accepted
- Date: 2026-07-18
- Slice: 3

## Context

The existing Guests screen keeps a small, contradictory page-local dataset. It conflates a family invitation with a person, invitation delivery with RSVP, and names with durable identities. Slice 3 needs a tenant-safe source of truth that can support invitations, per-person RSVP, menus and future seating without implementing those future modules now.

## Decision

`Household` is the invitation group; `Guest` is one person. Guests always belong to a household and are never represented as a household text blob. `WeddingEvent` becomes the operational source of truth for sub-events after onboarding reaches READY. The onboarding event data remains an immutable input snapshot and is materialized once with a deterministic source key.

The domain contains `WeddingEvent`, `Household`, `Guest`, `GuestRelationship`, `GuestTag`, `GuestTagAssignment` and append-only `GuestContactLog`. A plus-one is a real `Guest` linked to its primary guest. A child is a real `Guest` with `isChild=true`. Relationship constraints reject self-links, cross-workspace links and parent-child cycles.

Household invitation status is a derived read-model value over recipient, delivery, open and RSVP state. It cannot be patched directly. Guests with campaign, recipient or RSVP history are archived/soft-deleted; history remains referentially intact. Household deletion provides impact and cannot orphan active guests.

Contact fields are normalized. Private notes and accessibility/medical content are encrypted using the configured application key and never appear in logs, search snippets, notification bodies, activity summaries or public outbox subjects. Capability-aware serializers redact contact PII and sensitive fields.

Guest import uses only `ops/imports/guest-imports`, accepts CSV/XLSX up to 5 MiB, rejects XLSM/macros, uses random storage keys and mode `0600`, records SHA-256 and expiry, and never evaluates formula cells. `GuestImport` and `GuestImportRow` persist mapping, validation, duplicate candidates, explicit row decisions and commit results. Exact e-mail/phone/name-household matches precede optional fuzzy suggestions; fuzzy candidates are never merged automatically.

## Consequences

- Guest CRM metrics are calculated/projected from canonical rows, not stored totals.
- Calendar projects `WeddingEvent`; it does not duplicate it as a native calendar event.
- Seating, transport routes and accommodation inventory remain unavailable in Slice 3.
- Import and export are visible background jobs with durable artifacts and replay-safe row-level results.
