# ADR 0068: Generic Event Core compatibility profile

## Decision

Sarbato accepts all supported event categories through the workspace API. The
canonical outward fields are `eventType`, `eventDate`, `organizerName`, title,
location, timezone and currency. Existing wedding workspaces are backfilled as
`eventType=wedding`.

The first migration deliberately keeps `wedding_profiles.wedding_date`, the
`WeddingProfile` Prisma model and the stable `couple_owner` role key as internal
compatibility storage. APIs return both `eventDate` and the deprecated
`weddingDate` alias. New clients must write `eventDate`; old clients continue to
work without a data rewrite or a breaking role migration.

Supported event types are wedding, baptism, birthday, corporate, conference,
anniversary, private party, festival, fundraiser and other. Product copy and
new domain code use event-neutral language.

## Next slices

1. Add generic host/participant labels and event-type planning templates.
2. Expose neutral role display names while preserving stable authorization
   keys.
3. Introduce neutral route aliases for Wedding Day operations, then deprecate
   wedding-specific routes only after client telemetry shows no consumers.
4. Rename physical tables and Prisma models only in a separately rehearsed
   migration; this ADR does not authorize a destructive rename.

## Consequences

The product can create and identify non-wedding workspaces now. Some mature
modules still retain wedding terminology and templates internally. Their
generalization is incremental and must preserve tenant isolation, audit trails,
idempotency keys and existing URLs during the transition.
