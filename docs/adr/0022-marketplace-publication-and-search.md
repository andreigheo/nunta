# ADR 0022: Marketplace publication and search

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

The current Marketplace uses static profiles, invented verification/rating/review claims and local favorite state. Vendor draft fields and private contact data must never leak through a public search response.

## Decision

`VendorProfile` is a versioned vendor-owned aggregate with `DRAFT`, `PUBLISHED`, `UNPUBLISHED` and `SUSPENDED` states. Publication is explicit, idempotent and requires a complete display name, category, public description, at least one active service, at least one service region and a valid public contact policy. Publication writes `publishedAt` and a public snapshot version; unpublish removes the profile from marketplace reads without deleting history.

`VendorService`, `VendorPackage`, `VendorServiceRegion`, `VendorAvailabilityBlock` and `VendorPortfolioReference` remain vendor-owned. Portfolio entries are validated external URL references only; Slice 5 does not add general upload storage. Availability exposed by marketplace reads is `AVAILABLE`, `TENTATIVE`, `UNAVAILABLE` or `UNKNOWN`; only an explicit active `AVAILABLE` interval covering the requested range may be presented as available. Missing availability is `UNKNOWN`, never optimistic availability. `BOOKED` remains an internal blocking state and is exposed publicly as `UNAVAILABLE`.

Public marketplace list/detail queries select only published profiles and return a named public-safe DTO. Legal identifiers, private e-mail/phone, internal notes, membership, RFQ data, negotiation data and payment data are absent. Verification, rating and reviews are not returned because no verified evidence/review domain exists in Slice 5. Search/filter/sort/pagination run server-side over category, text, region, service, language, price range and availability.

`VendorFavorite`, `VendorShortlist` and `VendorShortlistItem` are wedding-workspace records. Favorites are unique by workspace/vendor. Shortlists are versioned, collaboratively visible according to workspace capability and support create/rename/delete plus add/remove. Vendor organizations cannot see whether a wedding favorited or shortlisted them.

## Consequences

- Production pages import no vendor seed data.
- Draft/private vendor fields remain inaccessible to public and unrelated tenants.
- Empty marketplace responses are truthful and do not synthesize vendors.
- Map sync, reviews, public ratings and verification badges remain absent/planned.

## Mandatory marketplace hardening amendment

Availability filters include only explicit `AVAILABLE` results. `TENTATIVE`, `UNAVAILABLE`, `BOOKED` and `UNKNOWN` are excluded. Offer acceptance revalidates the requested service range against current explicit availability inside the same serialized transaction. Booking agreement creates one idempotent `BOOKED` block bound uniquely to the booking. Cancellation retires only that booking-derived block and never deletes or rewrites manual availability.

Public list/detail inputs are bounded and normalized: cursor pagination has a fixed maximum, text is trimmed/case-normalized and length limited, filter cardinality and date range are capped, sort is an allowlist, and invalid combinations fail with a typed validation problem. Slugs are normalized lowercase ASCII and uniquely constrained. Publication validates required public fields and active services/regions. Unpublished and suspended profiles return the same not-found response. Any cache key includes the normalized public query and publication/version boundary; private or tenant-scoped data is never stored in a public cache.
