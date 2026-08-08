# WeddingOS Slice 4 final handoff

Date: 2026-07-19  
Scope: Seating Planner, Transport and Accommodation  
Visual direction: preserved; existing layout, typography, color tokens, spacing, responsiveness and shared UI primitives remain unchanged

## Outcome

Slice 4 replaces the production mock/local-state paths for `/seating`, `/transport` and `/accommodation` with persistent, tenant-isolated operations. Guest CRM, RSVP and `WeddingEvent` remain canonical inputs. Guest Companion exposes only the current household's published operational assignments. Overview, global search, Quick Create and guest drawers consume real Slice 4 data. Demo mode issues zero real mutations.

## Seating

- `VenueSpace`, `SeatingPlan`, immutable `SeatingPlanSnapshot`, tables, nested seats, assignments, constraints, issues and suggestion records are persistent.
- Eligibility is derived from the selected `WeddingEvent` and canonical RSVP data; declined/removed guests cannot remain silently eligible.
- Assignment batches are atomic and versioned. Duplicate guest/seat allocation, capacity overflow, cross-event/cross-workspace references and contradictory required constraints are rejected.
- Household, primary/plus-one, children and accessibility requirements feed the deterministic rules engine.
- The deterministic suggestion is generated asynchronously, versioned, explainable and review-only. It never auto-applies.
- Manual and locked assignments are preserved according to the request contract. Suggestion apply remains explicit, atomic, idempotent and concurrency-protected.
- Publish validates critical conflicts, creates an immutable snapshot and exposes only published household assignments to Guest Companion.
- CSV and real SVG exports use `GeneratedArtifact`; large export payloads are not stored in job JSON.

## Transport

- RSVP logistics requests are projected into canonical `TransportRequest` records; a request is distinct from an assignment.
- Plans, vehicles, routes, ordered stops and guest assignments are persistent and event/workspace scoped.
- Assignment batches are atomic and versioned. Vehicle capacity, accessible capacity, duplicate direction allocation and deleted/cross-workspace references are server-enforced.
- Publish is explicit and idempotent. Guest Companion returns only the current household's published route details and never returns another passenger list.
- CSV/XLSX manifests are real managed artifacts. Sensitive driver/contact data requires `transport.read_sensitive` and is excluded from redacted exports.

## Accommodation

- RSVP accommodation requests, properties, optional room types, rooms, stays and allocations are canonical records.
- Adult/child capacity, date ranges, overlapping allocations, household split confirmation and cross-property/cross-workspace references are validated server-side.
- Allocation batches are atomic, idempotent and versioned. Publish is explicit and controls Guest Companion visibility.
- Guest Companion returns only the current household's published property/room/stay details; it does not expose other rooms or guests.
- CSV/XLSX rooming lists use `GeneratedArtifact`. Protected contacts and private notes require `accommodation.read_sensitive`.

## Database and migrations

Slice 4 adds 26 tenant-scoped entities:

`VenueSpace`, `SeatingPlan`, `SeatingPlanSnapshot`, `SeatingTable`, `SeatingSeat`, `GuestSeatingAssignment`, `SeatingConstraint`, `SeatingIssue`, `SeatingSuggestionRun`, `SeatingSuggestion`, `SeatingSuggestionAssignment`, `TransportRequest`, `TransportPlan`, `TransportVehicle`, `TransportRoute`, `TransportStop`, `TransportRouteStop`, `GuestTransportAssignment`, `TransportIssue`, `AccommodationRequest`, `AccommodationProperty`, `AccommodationRoomType`, `AccommodationRoom`, `AccommodationStay`, `AccommodationAllocation` and `AccommodationIssue`.

Applied Slice 4 migrations:

1. `20260719090000_slice_4_operations`
2. `20260719093000_slice_4_guest_operations_bootstrap`
3. `20260719094500_slice_4_worker_derived_events`

There are 31/31 repository migrations applied. The core migration includes partial unique indexes, foreign keys, date/capacity checks, grants and forced RLS. The bootstrap helper is `SECURITY DEFINER`, validates the current opaque guest grant and returns only the current household. The worker helper accepts only allowlisted semantic events and verifies the persisted consumer context.

## Events, consumers and jobs

- New versioned events cover seating plan/table/assignment/suggestion/publish/export, transport request/plan/route/assignment/publish/manifest and accommodation request/property/stay/allocation/publish/rooming-list lifecycles.
- Closed consumers are `seating_suggestion`, `seating_issue_projection`, `seating_export`, `transport_issue_projection`, `transport_manifest`, `accommodation_issue_projection`, `accommodation_rooming_list` and `guest_operations_projection`.
- Generic `notification_projection`, `activity_projection` and `event_ack` remain reusable and non-recursive.
- Every consumer has its own durable `OutboxConsumerExecution`; BullMQ identity is deterministic over outbox message plus consumer.
- Only suggestion/export/manifest/rooming-list workflows create user-visible jobs. Internal projections do not create fake visible jobs.
- Delivery remains at-least-once with idempotent effects where supported.

## Permissions and privacy

- 19 atomic capabilities cover read/write/assign/publish/generate/export and sensitive access for Seating, Transport and Accommodation.
- Couple Owner/Partner and Wedding Planner receive the operational capabilities appropriate to their role. Family Collaborator and Viewer receive redacted read-only access and no private task or sensitive export access.
- API authorization and forced RLS protect every tenant table. Runtime API/worker processes use the restricted `weddingos_app` and `weddingos_worker` roles, never the owner role.
- Search, Activity, Notifications and logs contain redacted operational summaries. Public guest bootstrap cannot enumerate capacities, passenger lists, other guests or other rooms.

## Frontend

- `/seating`: real event/space/plan selection, persistent canvas/tables/seats, drag assignment with rollback, issues, deterministic proposal job, publish and SVG export.
- `/transport`: real requests, plans, vehicles, stops, routes, assignments, capacity state, publish and manifest generation.
- `/accommodation`: real requests, properties, rooms, stays, allocations, conflict state, publish and rooming-list generation.
- `/guest`: published-only `Masa mea`, `Transport` and `Cazare` sections.
- Guest drawer: Seating, Transport and Cazare tabs use canonical records.
- Overview: real operational metrics and rule-based operational next actions.
- Search: seating plans/tables, transport plans/routes/stops, properties/rooms/stays with capability filtering.
- Quick Create: real table, route and property actions. External routing, live tracking, hotel booking, PDF and AI optimization remain disabled/planned.
- Loading, empty, error, conflict, job and demo states are honest; there is no production seed fallback or false success.

## OpenAPI and registries

- 66 active Slice 4 operations are documented with named request/response schemas, Problem Details, cookie auth, capabilities, `If-Match`, `Idempotency-Key` and success/error status contracts where applicable.
- Swagger Parser validation passes. The active Slice 4 surface contains no planned operation.
- `API_OPERATION_REGISTRY.json`, `FRONTEND_INVENTORY.json`, `BACKEND_ENTITY_CATALOG.json`, `AUTOMATION_REGISTRY.json` and `PERMISSION_MATRIX.csv` are reconciled to implemented behavior.

## Validation evidence

- Format: passed.
- Lint: passed.
- Typecheck: passed across frontend, API, worker and packages.
- Unit: 58 passed, 0 failed, 0 skipped (7 frontend + 33 API + 18 worker).
- Integration: 26 passed, 0 failed, 0 skipped (17 Slice 1 + 3 Slice 2B + 6 Slice 3/4 journeys).
- E2E: 60 passed, 0 failed, 0 skipped (7 Slice 1 + 12 Slice 2B + 19 Slice 3 + 22 Slice 4).
- API build: passed.
- Worker build: passed.
- Frontend build: passed; 52 routes generated.
- OpenAPI validation: passed, including the complete Slice 4 surface.
- Database: 31/31 migrations applied; Prisma reports the schema up to date.
- Persistent runtime: PostgreSQL, Redis, Mailpit, API, worker and web are healthy; all three user services are active and enabled.
- Authenticated route smoke: `/seating`, `/transport` and `/accommodation` reached their real API-backed ready/empty states on `http://127.0.0.1:43191` and were visually inspected in Chromium.
- Restart recovery: API PID `590502 -> 596976`, worker PID `590500 -> 596977`, web PID `590503 -> 596978`; every unit returned active with `NRestarts=1`, readiness reported database/Redis/worker healthy and `/sign-in` returned 200.

## Limitations

### EXPECTED FOR NEXT SLICE

- Marketplace, vendors, RFQ, offers, bookings, contracts, budget and payments.
- External route optimization, Google/Apple Maps synchronization, live vehicle tracking and real hotel booking.
- WhatsApp/SMS, PDF rendering and general Copilot/AI optimization.

### TECHNICAL DEBT

- Operational list endpoints are bounded for the current wedding-scale workload; cursor contracts should be added before supporting unusually large events.
- Seating seats are created with a table and updated individually; a standalone seat add/remove endpoint can be added if the UI later needs incremental seat topology editing.
- `OperationsService` is intentionally one cohesive Slice 4 transaction boundary today; split it by domain before materially expanding these modules.

### BLOCKER

- None.

## Verdict

**READY FOR SLICE 5**

Slice 5 was not started.
