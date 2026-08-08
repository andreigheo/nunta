# ADR 0008: Demo API isolation

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2A browser data boundary

## Context

WeddingOS intentionally keeps future modules as product demos. A visual convention is not a security boundary: a reused control, effect, or service can accidentally issue a credentialed mutation while the user is in demo mode.

## Decision

The typed browser API client is the mandatory transport boundary. Before constructing or issuing `fetch`, it reads the server-set demo cookie and rejects every `/api` request with `DemoModeApiBlockedError`. No request reaches the network. The rejection emits no false success toast and is centrally classifiable for a clear demo message.

Demo route entry and exit are explicit. Demo-only pages retain static data but their global or mutating controls are disabled and labeled `Disponibil într-o etapă viitoare`. Production-backed Slice 1/2A routes use the real session mode. Direct `fetch` to the WeddingOS API is prohibited outside the client and covered by source and browser tests.

The guard is defense in depth, not authorization: the backend continues to authenticate, authorize, validate origin, enforce RLS, and reject malformed requests. An E2E test installs a network observer, attempts a guarded demo mutation, and proves zero API requests.

## Consequences

- A future demo control cannot silently mutate real data through the shared client.
- Demo and authenticated modes must be deliberate in navigation and tests.
- Planned UI can remain visible, but it cannot claim persistence, delivery, upload, generation, or completion.
- Any future alternative transport must implement the same fail-closed guard or remain forbidden.
