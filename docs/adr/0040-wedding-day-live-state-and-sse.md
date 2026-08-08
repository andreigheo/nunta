# ADR 0040: Wedding Day live state and SSE

Status: Accepted for Slice 8  
Date: 2026-07-20

## Decision

PostgreSQL is the source of truth, Redis pub/sub is an ephemeral fan-out bus, and Server-Sent Events is the client transport. No business state exists only in Redis.

Organizer streams are scoped to a verified workspace membership and `wedding_day.read`. Guest streams resolve the opaque guest token to a persisted, non-revoked `GuestAccessGrant`; clients cannot select arbitrary channels. Organizer and guest event types use separate allowlists. Guest payloads contain only guest-visible agenda changes and announcements whose persisted audience snapshot includes that grant/household.

Every live mutation appends a `WeddingDayLiveEvent` replay record with a monotonically increasing sequence, safe payload, scope and expiry before Redis publish. SSE supports `Last-Event-ID`, bounded replay, heartbeats, reconnect and a polling fallback. A disconnected client reconstructs current truth through the command-center or guest bootstrap endpoints.

Connections are rate limited and capped per principal. Heartbeats carry no private state. Medical/security incident bodies, guest presence for other households, contact secrets, QR tokens, device secrets and storage keys are forbidden from guest events and logs.

Delivery is at-least-once. Clients deduplicate by event ID; handlers and projections are idempotent. SSE delivery is not proof that a client displayed an event.
