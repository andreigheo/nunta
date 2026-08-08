# ADR 0021: Vendor organization and dual-tenant model

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

WeddingOS already has wedding workspaces with membership, capabilities and forced RLS. Marketplace and Vendor OS require a second tenant type whose private data must not become reachable through wedding membership, while a booking and contract must be visible to exactly the wedding and vendor that are parties to it.

## Decision

`VendorOrganization` is a separate tenant root. `VendorOrganizationMembership`, `VendorRoleTemplate`, `VendorMembershipCapabilityOverride` and `VendorOrganizationInvitation` define its authorization lifecycle. A user may belong independently to many wedding workspaces and many vendor organizations. Vendor roles are `vendor_owner`, `vendor_manager`, `vendor_sales`, `vendor_operations` and `vendor_viewer`; the final active owner cannot be removed or downgraded.

The application transaction context adds `app.current_vendor_organization_id`. Wedding and vendor requests set only the tenant context that was resolved from their authenticated membership. A request body or queue payload cannot grant a second tenant context. Cross-tenant resources (`RequestForQuote`, `VendorOffer`, `NegotiationThread`, `VendorBooking`, `VendorContract`) persist both party IDs. An API serving one party first loads the relationship under that party's context, then exposes only the fields allowed to that party.

Vendor-owned data consists of profile, services, packages, regions, portfolio references and availability. Wedding-owned data consists of favorites, shortlists, RFQs, internal evaluation, budget, expenses and payments. Shared records are not copied into parallel aggregates. Offer and contract versions contain immutable party-facing snapshots so later profile edits do not rewrite history.

Every tenant-scoped table uses forced RLS. Wedding-only policies require current workspace plus active membership; vendor-only policies require current vendor organization plus active membership; cross-tenant policies allow one valid side at a time. Missing context fails closed. Runtime roles remain `weddingos_app` and `weddingos_worker`, neither owner nor `BYPASSRLS`.

## Consequences

- Wedding membership never implies vendor access and vendor membership never implies wedding access.
- Public marketplace publication is a separate redacted read path, not vendor-tenant membership.
- Worker context is derived from persisted outbox/execution plus the referenced aggregate; forged dual-tenant payload values are ignored and tested.
- Shared bookings/contracts have one canonical identity and explicit party visibility.

## Mandatory commercial hardening amendment

Vendor invitations use a dedicated lifecycle: `PENDING`, `ACCEPTED`, `DECLINED`, `REVOKED` and derived `EXPIRED`. The opaque token is returned only to the delivery command; the database stores only its SHA-256 hash. Resend rotates the token, increments a generation counter and invalidates the previous token. Accept requires an authenticated user whose normalized e-mail equals the invitation e-mail; decline, revoke and expiry are terminal for that token generation. Public token lookup returns the same neutral response for missing, expired, revoked and already-used tokens and is rate limited. Invitation lifecycle changes are audited and delivery intent is committed through the outbox. Last-owner protection applies after invitation acceptance as it does to direct membership changes.

Cross-tenant service entry is deliberately narrow: first resolve a shared resource identifier without exposing data, derive its persisted workspace and vendor organization, verify the authenticated side and atomic capability, then set only that side's transaction-local tenant context. A request body, URL query or queue transport payload cannot supply or override either tenant ID. Side-specific serializers are allowlists, not redaction after a broad serialization.

Worker execution context is rebuilt from `OutboxConsumerExecution -> OutboxMessage -> referenced aggregate`. Before any effect, the worker verifies execution ID, outbox ID, consumer name, event name, aggregate identity, workspace, vendor organization and acting party against persisted relationships. Missing or conflicting relationships fail permanently and closed. BullMQ carries only execution/outbox/consumer identity.
