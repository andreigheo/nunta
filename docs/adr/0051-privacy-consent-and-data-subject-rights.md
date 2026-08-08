# ADR 0051 — Privacy, consent and data-subject rights

Status: Accepted — 2026-07-21

## Context

WeddingOS stores identity, household, allergy, commercial, payment, document, communication, check-in and AI data. A boolean marketing field and accepted terms version are not sufficient evidence for optional consent or data-subject requests.

## Decision

- Immutable `LegalDocumentVersion` records hold language, effective date, content hash, publish state and reviewed content markers. Legal review placeholders remain explicit.
- Consent history is append-only in `UserConsentRecord`; withdrawal appends `ConsentWithdrawal` and never rewrites the grant.
- Processing basis is recorded as `CONSENT`, `CONTRACT`, `LEGAL_OBLIGATION` or `LEGITIMATE_INTEREST`. Contract/legal processing is not presented as optional consent.
- Cookie preferences contain essential, preferences, analytics and marketing categories. Essential is always active; optional categories default off. No analytics script is loaded when no provider is configured.
- `DataSubjectRequest` uses the state machine `SUBMITTED → VERIFYING → VERIFIED → IN_REVIEW → PROCESSING → COMPLETED`, with explicit rejection, cancellation and expiry branches.
- User, workspace-owner and vendor-owner exports create requester-bound, expiring `GeneratedArtifact` records. Export manifests are bounded, checksum-protected and omit secrets, tokens and raw provider payloads.
- Deletion is a verified plan, grace period, soft-disable and bounded purge. It is never an immediate cascade. Shared contracts, ledger entries, disputes, audit and legally retained records survive as redacted/tombstoned evidence.
- The privacy UI explains retention conflicts and never promises immediate deletion.

## Consequences

Privacy requests become observable and replay-safe. Legal copy requires qualified review before public launch; the product exposes implementation facts, not unsupported compliance badges.
