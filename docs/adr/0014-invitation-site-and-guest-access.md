# ADR 0014: Invitation site and guest access

- Status: Accepted
- Date: 2026-07-18
- Slice: 3

## Context

The invitation editor and `/guest` route currently use hardcoded content and offer false local success. Guest Companion must work without a WeddingOS account while remaining strictly scoped to one invitation household.

## Decision

`InvitationSite` owns a mutable draft pointer and an immutable published-version pointer. `InvitationVersion` stores the validated block document, settings, language and content hash. Publishing creates a new immutable version atomically, points the site at it and emits `invitation.site_published.v1`; it never sends a campaign automatically. Published sites are `TOKEN_ONLY` or `TOKEN_OR_ACCESS_CODE`; Slice 3 uses token-only access by default.

`InvitationRecipient` snapshots household/guest personalization and the published invitation version. `GuestAccessGrant` scopes access to exactly that recipient and household. Raw bearer tokens have at least 256 bits of entropy, are returned only at grant creation/delivery boundaries, and only SHA-256 hashes are persisted. QR generation uses the authorized organizer endpoint and a short-lived, newly rotated grant when the original raw token is unavailable; individual SVG/PNG is implemented, while a QR kit remains planned.

Public access is resolved by a narrow security-definer database function that accepts a token hash and returns only an active, non-expired grant identity. The API then opens a transaction with `app.current_guest_access_grant_id` and `app.current_workspace_id`; forced RLS policies restrict every public read/write to the grant household, recipient, published invitation, visible events, active menus and the household's own RSVP. Workspace ID from a request is never authority.

`GET /api/v1/guest/bootstrap` returns public-safe invitation data, visible events, the scoped household, current RSVP, active menus, deadline and edit permissions. `GET/PUT /api/v1/guest/rsvp` uses the same token contract. Tokens are rate-limited, revocable and rotatable; access logging stores grant/recipient IDs and redacted metadata, never the token.

## Consequences

- Guest Companion cannot enumerate other recipients or access dashboard APIs.
- Revoked and expired tokens fail before domain data is read.
- Media remains URL-reference only; uploads, gallery and moments are planned.
- Preview for authenticated organizers is separate from public guest authority.
