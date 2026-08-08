# ADR 0017: Seating plan and assignment domain

- Status: Accepted
- Date: 2026-07-19
- Slice: 4

## Context

Guest CRM, `WeddingEvent` and per-guest/event RSVP are already canonical. Seating needs editable layout state, event-specific assignments, eligibility and capacity checks, immutable publication, privacy-safe issue reporting and tenant isolation. The existing `/seating` page is local mock state and must become a real API client without changing the visual system.

## Decision

`VenueSpace` describes one event space. `SeatingPlan` is the mutable aggregate and references one space and one `WeddingEvent`. `SeatingTable`, `SeatingSeat`, `GuestSeatingAssignment` and `SeatingConstraint` are tenant-scoped children. Every mutation validates the workspace, plan event, optimistic version and capability inside the same RLS transaction.

Eligibility is derived from active `Guest`, active event and `GuestEventResponse=CONFIRMED`. Manual organizer overrides require a non-empty reason and are retained in the assignment metadata/audit trail. A guest can have one active assignment per plan/event and a seat can have one active guest. Batch assignment is atomic and idempotent; drag-and-drop submits one versioned batch, uses optimistic UI, and rolls back to server state on conflict.

Household, child and plus-one grouping are derived from canonical `Household`, `Guest` and `primaryGuestId`. They are not copied into seating rows. Separating a group is allowed only as an explicit reviewed change and produces a persistent issue. Allergy details never appear on the canvas or in generic issues; authorized users receive only a protected table summary and the public UI says `Necesită verificare alimentară`.

`SeatingIssue` is a deduplicated read model over eligibility, capacity, group and constraint checks. Details are redacted. Resolving or ignoring an issue requires `If-Match`; ignore requires a reason.

Publish validates critical issues, creates an immutable `SeatingPlanSnapshot`, updates `publishedSnapshotId`, emits `seating.plan_published.v1`, and never starts a campaign. Guest Companion reads only the published snapshot and only the token household's assignment. Unpublish removes public visibility but does not delete snapshots.

CSV and SVG exports are user-visible jobs backed by `GeneratedArtifact`; PDF remains planned until a real renderer is adopted. Catering output requires `seating.read_sensitive_summary` and is the only seating export allowed to contain authorized dietary detail.

All Slice 4 tenant tables use forced RLS. The application role uses capability-aware policies and the worker role receives only narrow grants plus persisted outbox context. Runtime never uses the migration-owner role.

## Consequences

- Layout, assignments and publication remain event-specific and auditable.
- Guest/household names are read projections, never assignment authority.
- Published guest information is stable until explicit republication.
- RSVP changes may mark a published plan stale, but never move other guests automatically.
- Table-only operation is supported; individual seats are optional.
