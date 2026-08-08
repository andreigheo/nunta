# ADR 0016: RSVP and menu domain

- Status: Accepted
- Date: 2026-07-18
- Slice: 3

## Context

An RSVP is not one household status. Every person may attend a different subset of wedding events, choose a menu and disclose protected dietary/accessibility information.

## Decision

`RsvpFormDefinition` owns the mutable configuration and `RsvpFormVersion` is the immutable published snapshot. Its deadline is interpreted in the workspace timezone, must precede the wedding date, and controls guest edits. Admin override is capability-protected, versioned, audited and requires a reason.

`RsvpSubmission` is one versioned household/recipient submission. `GuestEventResponse` stores attendance for each scoped guest and guest-visible RSVP-enabled `WeddingEvent`. Guest submit is atomic and validates token scope, form version, deadline, optimistic version, member ownership, event/menu validity, plus-one allowance and child rules. A plus-one is upserted by `(primaryGuestId, isPlusOne)` so retry cannot duplicate it. Declines remove incompatible active menu selections while retaining history/audit facts.

`Menu`, `MenuCourse` and `DietaryTag` define organizer-controlled choices. `GuestMenuSelection` records at most one active choice for the Slice 3 reception scope. `GuestAllergy` and `AllergyIssue` hold protected allergy workflow. Free-text details, accessibility notes and resolution notes are AES-256-GCM encrypted with a versioned key envelope; application responses decrypt only for `guest.read_sensitive`/allergy capabilities. High-severity issues emit a redacted notification only.

Guest edits require the current submission version and idempotency key. Organizer edits use `If-Match`, idempotency, a reason and a distinct `source=ADMIN_OVERRIDE`. Form and invitation publication remain separate explicit actions.

## Consequences

- RSVP metrics are derived per person and event, including partial households.
- Menus and allergy resolution are real; table assignment remains blank/planned until Seating.
- Catering export is a requester-bound expiring artifact and requires a separate sensitive-data capability when allergies are included.
- Sensitive medical content is absent from logs, search, generic activities, notifications and plaintext outbox payloads.
