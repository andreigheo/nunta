# ADR 0033: Verified review eligibility and moderation

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

WeddingOS has persisted cross-tenant bookings, but the existing `/reviews` page is local seed state. Public trust must be derived from a real booking without exposing wedding identity or private moderation material.

## Decision

`ReviewEligibility` is created only from a persisted eligible `VendorBooking` and binds workspace, vendor, booking and eligible user. The standard rule is `COMPLETED_BOOKING`; override eligibility is platform-audited. A database uniqueness constraint and idempotent command prevent more than one active review per eligibility.

`VendorReview` owns immutable `VendorReviewVersion` rows and integer `VendorReviewCriterionRating` rows. Draft, submit, publish, edit-window, update, withdrawal and verification transitions are explicit and optimistic-concurrency protected. Public identity is a redacted display snapshot; the real author remains private.

Reports and vendor disputes open a `VendorReviewModerationCase`. Decisions are append-only `VendorReviewModerationDecision` records with actor, reason and previous public state. Private dispute statements and moderation notes never enter public serializers. Moderation hides/restores content through state transitions and never destroys the original version.

## Consequences

- No anonymous or booking-free review is accepted.
- Vendor members may reply or dispute, but never edit the review.
- Forced RLS permits wedding-side ownership, the related vendor side and narrow platform moderation independently.
- Notification/activity projections use semantic event IDs and cannot recursively create review events.
