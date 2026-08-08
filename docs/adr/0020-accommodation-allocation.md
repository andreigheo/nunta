# ADR 0020: Accommodation allocation

- Status: Accepted
- Date: 2026-07-19
- Slice: 4

## Context

RSVP already owns accommodation demand. Slice 4 must allocate guests and households to manually entered properties/rooms/stays, validate adult/child/accessibility/date constraints, export rooming lists and publish only guest-scoped information. It must not introduce prices, vendors or commercial bookings.

## Decision

`AccommodationRequest` is the versioned RSVP-derived demand projection. `AccommodationProperty`, `AccommodationRoomType`, `AccommodationRoom`, `AccommodationStay`, `AccommodationAllocation` and `AccommodationIssue` are the operational aggregate and read models. Properties and rooms are manually entered resources, not marketplace/vendor records.

Allocation batches are atomic, idempotent and use `If-Match`. They reject overlapping guest stays, unavailable rooms, dates outside the stay and adult/child capacity overflow. Household splitting and child-without-adult require a warning plus explicit confirmation/reason where allowed. Accessibility mismatches create critical protected issues and block publish.

RSVP decline/cancellation marks affected allocations invalid/cancelled and creates deduplicated issues; no other guest is moved automatically. Sensitive accessibility requirements, contact phones and room private notes are encrypted or redacted and are never emitted in generic projections.

Publishing a stay revalidates rooms, dates, requests and unresolved critical issues. Guest Companion returns only the scoped household's published property/room/date/instruction data. It never lists other rooms, households, capacity, notes or costs.

CSV/XLSX rooming lists are user-visible jobs backed by `GeneratedArtifact`. Protected organizer notes are included only with `accommodation.read_sensitive`; allergies and private RSVP messages are always excluded.

## Consequences

- Accommodation demand and operational allocation have clear ownership.
- Household rules remain derived from Guest CRM.
- Guest visibility is publication-gated and token-scoped.
- The model can later reference vendor/booking domains without creating them now.
