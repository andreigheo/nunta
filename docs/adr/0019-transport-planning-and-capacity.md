# ADR 0019: Transport planning and capacity

- Status: Accepted
- Date: 2026-07-19
- Slice: 4

## Context

RSVP already owns guest intent (`needsTransport`). Slice 4 needs operational requests, manually entered vehicles/stops/routes, capacity validation, publication, manifests and guest-safe instructions without creating vendors, bookings or external routing.

## Decision

`TransportRequest` is a versioned projection of the latest scoped RSVP intent and preserves organizer overrides. `TransportPlan` belongs to one `WeddingEvent`; `TransportVehicle`, `TransportRoute`, `TransportStop`, `TransportRouteStop`, `GuestTransportAssignment` and `TransportIssue` are operational records. Vehicles are manual resources, not vendor records.

RSVP projection upserts/cancels requests without deleting history. A changed request or attendance invalidates the affected assignment and creates a deduplicated issue; it does not move passengers or publish a plan.

Assignment batches are atomic, idempotent and versioned. Effective capacity is route override or vehicle capacity. The service rejects duplicate same-event/direction assignments and inaccessible-capacity overflow; general overflow produces a critical issue and blocks publish. Household bulk assignment is a typed batch, not repeated client patches.

Sensitive pickup addresses, requirements and driver/property contact phones use the existing encrypted-field helper. They are excluded from logs, public outbox payloads, Activity, Notifications and search. Manifests include protected phone/driver data only when the caller has `transport.read_sensitive`; allergies and medical details are never included.

Publishing revalidates requests, attendance, route/vehicle/stop and capacity state. Guest Companion reads only the token household's assignments from a published plan and returns the minimum intended route, stop and time information. It never returns the passenger list or internal capacity.

CSV/XLSX manifests are user-visible `BackgroundJob` operations using `GeneratedArtifact`, managed storage, checksum, expiry and owner authorization.

## Consequences

- RSVP intent remains canonical while operational status can be managed independently.
- Route ordering is explicit; no maps provider or geographic optimizer is introduced.
- Publication and guest visibility are explicit and revocable.
- Capacity and privacy rules are enforced server-side and by forced RLS.
