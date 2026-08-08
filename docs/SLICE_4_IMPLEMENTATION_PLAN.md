# WeddingOS Slice 4 implementation plan

- Status: Implemented and validated
- Date: 2026-07-19
- Baseline: Slice 3 `READY FOR SLICE 4`

## Baseline gate

- `pnpm verify`: passed from the synchronized Linux runtime; format, lint, typecheck, 51 unit tests, 25 integration tests and all builds passed.
- Existing E2E: 38 passed, 0 failed, 0 skipped.
- Database: 28 migrations found and applied; schema is current.
- Persistent services: API, worker and web active/enabled; PostgreSQL, Redis and Mailpit healthy.
- Canonical inputs: `Guest`, `Household`, `WeddingEvent`, `RsvpSubmission` and `GuestEventResponse`.
- Mock surfaces confirmed: `/seating`, `/transport` and `/accommodation` currently use local/hardcoded state and toast-only success.

## Proposed migration and entities

Migration `20260719090000_slice_4_operations` introduces:

- Seating: `VenueSpace`, `SeatingPlan`, `SeatingPlanSnapshot`, `SeatingTable`, `SeatingSeat`, `GuestSeatingAssignment`, `SeatingConstraint`, `SeatingIssue`, `SeatingSuggestionRun`, `SeatingSuggestion`, `SeatingSuggestionAssignment`.
- Transport: `TransportRequest`, `TransportPlan`, `TransportVehicle`, `TransportRoute`, `TransportStop`, `TransportRouteStop`, `GuestTransportAssignment`, `TransportIssue`.
- Accommodation: `AccommodationRequest`, `AccommodationProperty`, `AccommodationRoomType`, `AccommodationRoom`, `AccommodationStay`, `AccommodationAllocation`, `AccommodationIssue`.

The migration adds enum/check constraints, partial unique indexes for active assignments, capacity/date/self-reference checks, foreign keys, query indexes, forced RLS, app/worker grants and default role capabilities. Follow-up migrations `20260719093000_slice_4_guest_operations_bootstrap` and `20260719094500_slice_4_worker_derived_events` close the household-only public bootstrap and persisted-context worker event contracts. No owner credential is used at runtime.

## API operations

### Seating

- Venue space CRUD.
- Seating plan CRUD, publish/unpublish and issue list/update.
- Table CRUD with nested seat creation and individual seat update.
- Atomic assignment batch and assignment removal.
- Constraint CRUD.
- Suggestion request/get/apply.
- CSV/SVG export job.

### Transport

- Request list/update.
- Plan CRUD/publish.
- Vehicle, route and stop CRUD; ordered route stops.
- Atomic assignment batch and issue projection in the plan detail.
- CSV/XLSX manifest job.

### Accommodation

- Request list/update.
- Property/room/stay CRUD with optional canonical room-type linkage.
- Stay CRUD/publish.
- Atomic allocation batch and issue projection in the stay detail.
- CSV/XLSX rooming-list job.

Every active mutation documents/validates its applicable `If-Match`, `Idempotency-Key`, capability and Problem Details response. Operational lists are deliberately bounded for this slice.

## Events, consumers and visible jobs

Events follow the Slice 4 catalog: seating plan/table/assignment/suggestion/issue/publish/export; transport request/plan/route/assignment/issue/manifest; accommodation request/property/stay/allocation/issue/rooming-list.

Closed consumer additions:

- `seating_suggestion`
- `seating_issue_projection`
- `seating_export`
- `transport_issue_projection`
- `transport_manifest`
- `accommodation_issue_projection`
- `accommodation_rooming_list`
- `guest_operations_projection`

`notification_projection` and `activity_projection` remain generic. Only suggestion/export/manifest/rooming-list operations create user-visible `BackgroundJob` rows. Internal issue and guest projections use durable `OutboxConsumerExecution` rows but no visible job.

## Capabilities

- Seating: `seating.read`, `seating.write`, `seating.assign`, `seating.publish`, `seating.generate_suggestion`, `seating.export`, `seating.read_sensitive_summary`.
- Transport: `transport.read`, `transport.write`, `transport.assign`, `transport.publish`, `transport.export`, `transport.read_sensitive`.
- Accommodation: `accommodation.read`, `accommodation.write`, `accommodation.assign`, `accommodation.publish`, `accommodation.export`, `accommodation.read_sensitive`.

Couple owner/partner and wedding planner receive operational Slice 4 capabilities; family collaborator and viewer receive redacted read only. Sensitive capabilities are excluded from family/viewer defaults.

## Privacy and tenancy

- Sensitive address/requirements/phone/note fields are encrypted or withheld.
- Generic issues, Activity, Notifications, logs and search contain redacted summaries only.
- Exports enforce both owner authorization and the matching sensitive capability.
- Public guest token lookup derives workspace/household from the persisted grant and returns published rows for that household only.
- Every tenant table uses forced RLS; worker payload workspace values are never trusted.

## Frontend connection plan

- `/seating`: preserve current page composition and canvas language; replace local tables/guests with event/space/plan selectors, persistent table positions, atomic drag assignments, constraints/issues, deterministic proposal review and real CSV/SVG jobs.
- `/transport`: replace hardcoded routes with Requests, Plans, Vehicles, Routes, Stops, Assignments, Issues and Manifest sections.
- `/accommodation`: replace hardcoded properties with Requests, Properties, Rooms, Stays, Allocations, Issues and Rooming List sections.
- Guest/Household drawers navigate to or mutate canonical operations APIs.
- `/guest` shows publication-gated `Masa mea`, `Transport` and `Cazare` sections.
- Overview, search, command palette, navigation badges and Quick Create consume real operational data.
- Google/Waze links are optional navigation only. Maps routing, AI optimization, WhatsApp and PDF remain disabled/planned.

Design tokens remain the current `brand/accent/success/warning/danger/info` system, existing typography and UI primitives. Capacity bars, conflict badges and the seating canvas are functional information structures, not a redesign.

## Test plan

Unit coverage includes eligibility/grouping/capacity/constraints/issues/suggestion/locks/snapshot, RSVP stale projection, transport and room capacity, overlaps, privacy redaction, permissions, exports and next-best-action.

Integration coverage uses real PostgreSQL, Redis, BullMQ and worker for CRUD, batches, suggestion, publish, RSVP projections, artifacts, Guest Companion visibility, notifications/activity aggregation, RLS, forged workspace, concurrency and idempotency.

E2E adds the 22 mandatory Slice 4 journeys with 0 skipped, while retaining all 38 prior tests. Demo E2E observes zero `/api/v1` mutations.

## Exact implementation order

1. Add contracts/capabilities/event/consumer payloads.
2. Add Prisma entities and migration with constraints, indexes, grants and RLS.
3. Implement shared eligibility, grouping, capacity, issue and deterministic suggestion rules with unit tests.
4. Implement Seating API, snapshot publication and export worker.
5. Implement RSVP operations projection and Transport API/manifest worker.
6. Implement Accommodation API/rooming-list worker.
7. Extend Guest Companion, dashboard, search, notifications and activity.
8. Connect Seating, Transport, Accommodation, drawers, Quick Create and command palette without visual redesign.
9. Reconcile OpenAPI and all registries.
10. Run unit/integration/E2E/build/migration/route gates, create `SLICE_4_HANDOFF.md`, synchronize the persistent runtime and prove restart recovery.
