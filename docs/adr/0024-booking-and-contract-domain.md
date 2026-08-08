# ADR 0024: Booking and contract domain

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

An accepted offer must become operational work and a reviewable agreement without pretending that WeddingOS processes money or provides a qualified electronic signature.

## Decision

`VendorBooking` is the canonical shared commercial relationship created only by accepted-offer projection. `BookingServiceItem` is an immutable snapshot of selected offer lines. `BookingMilestone` is versioned operational state. Booking status changes use side-specific transitions: wedding may cancel/dispute/archive, vendor may start/complete, and only an agreed contract may confirm the booking. Status cannot be patched arbitrarily.

`VendorContract` points to mutable current draft and immutable agreed version. `VendorContractVersion` stores a structured document, party snapshots, service scope, exclusions, dates, totals, payment terms, cancellation/rescheduling/force-majeure/privacy clauses and a SHA-256 content hash. The hash covers the complete contractual envelope: document, party snapshots, summary, service scope, payment terms and cancellation terms. Every content change creates a new version; only `effective_at` and `superseded_at` lifecycle metadata may be added to an existing immutable version.

`ContractPartyAcknowledgement` records typed name, statement version, party identity, user, content hash and timestamp. It is labelled `Confirmare auditabilă în WeddingOS`, never qualified e-signature. Agreement occurs only when an immutable current version has active wedding and vendor acknowledgements for exactly the same content hash. Agreement atomically confirms the booking, commits the budget item, activates the versioned payment schedule and emits `contract.acknowledged.v1`.

The UI always displays: `Document operațional generat pe baza datelor introduse. Pentru validitate juridică și conformitate locală, documentul trebuie verificat de un profesionist autorizat.`

Contract HTML export is a visible background job using an immutable version, `BackgroundJob`, `GeneratedArtifact`, checksum, expiry and requester-bound download. PDF remains disabled until a real tested renderer exists; draft-changing payloads and unmanaged temporary files are prohibited.

## Consequences

- Offer, booking and contract history remains reproducible after vendor/profile edits.
- Two-party acknowledgement is auditable but makes no legal-signature claim.
- Agreement, booking confirmation and financial projections cannot partially diverge.
- Contract upload/OCR/general document storage and external e-signature remain outside Slice 5.

## Mandatory source and amendment hardening amendment

Canonical source bindings are database constraints, independently of idempotency rows: one booking per accepted offer, one contract per booking, one booking item per accepted offer line, and one booking-derived availability block per booking. Booking snapshots contain vendor display identity, selected service/package identity, accepted offer and version, selected lines, quantities, pricing, tax, discount, availability statement, cancellation terms, RFQ requirements and answers. Contract versions contain immutable wedding and vendor business-party snapshots. Later profile, service or organization edits do not rewrite them.

An agreed contract and its agreed version are immutable. A later change starts an amendment from the agreed version, creating a new immutable-version lineage in `DRAFT`, then `IN_REVIEW`, then `READY_FOR_ACKNOWLEDGEMENT`. Each edit creates another version and therefore invalidates acknowledgements for the previous draft without deleting historical acknowledgements. Both parties must acknowledge the same current content hash. Only then does the amendment become effective and the prior effective version become superseded.

Amendment effectiveness atomically replaces only future, unpaid schedule entries sourced from the superseded contract version. Each generated entry is uniquely bound to `(contract version, sequence)`. Confirmed historical payments and their original schedule references remain unchanged. If replacement cannot complete, neither the effective contract version nor future schedules change. Contract reads expose the version lineage, effective/superseded timestamps, version-specific acknowledgements and schedule impact.

The second-party acknowledgement may arrive from the vendor tenant, which intentionally has no general access to the wedding budget. Financial activation therefore uses a narrow `SECURITY DEFINER` database contract. It verifies the session actor, persisted wedding/vendor relationship, current agreed version, both matching acknowledgements and currency, then applies only the linked booking, budget, schedule and availability effects with row security disabled inside that bounded function. It returns no private budget data and does not grant the vendor a workspace context.
