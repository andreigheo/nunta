# ADR 0069: Accommodation discovery and event-scoped demand

- Status: Accepted
- Date: 2026-09-10
- Supersedes in part: ADR 0020

## Context

Sarbato must help organizers discover accommodation before service providers are onboarded in the marketplace. Open internet data can identify possible properties, but it does not by itself prove availability, current prices, contractual terms or booking success. The operational accommodation domain must also support workspaces with multiple events without mixing guest demand or room allocations between them.

ADR 0020 intentionally limited inventory to manually entered properties. That boundary remains valid for canonical operations, while this decision adds a separate discovery and recommendation path that can feed the operational domain only through an explicit organizer action.

## Decision

`AccommodationRecommendation` remains an informational, provenance-bearing lead. Provider records retain their source, external identifier, attribution and observation time. They are never treated as a reservation, a paid booking or verified live inventory. The response contract publishes provider capabilities explicitly; a provider without live pricing or availability must return `false` for those capabilities and the UI must explain that limitation.

`AccommodationProperty`, `AccommodationStay`, rooms and allocations remain the canonical operational records. An organizer with `accommodation.write` may explicitly promote one recommendation into this domain. Promotion is idempotent, records the source recommendation, creates an event-scoped stay, optionally creates initial rooms and emits `accommodation.recommendation_promoted.v1`. Repeating promotion cannot create duplicate operational stays for the same workspace and recommendation.

Accommodation demand is scoped by both guest and `WeddingEvent`. Guest RSVP writes event-specific intent, dates, booking mode, room preference and optional budget to `GuestEventResponse`. The worker projects that intent asynchronously into `AccommodationRequest`, preserving organizer overrides. A stay can allocate only requests from its own event, and issue calculation may not mix guests from other events.

The provider layer is capability-based. OpenStreetMap is the only enabled discovery provider initially and supplies location-oriented public data only. Foursquare, Google Places, Booking.com and Expedia descriptors remain disabled until credentials, commercial terms, attribution, privacy review, error budgets and provider-specific contract tests are complete. No adapter may fabricate prices, availability or booking links.

Sarbato does not become the merchant of record, package-travel organizer or accommodation booking engine through this flow. The product assists discovery, communication and planning; organizers and guests verify and complete reservations with the property or a future authorized provider.

## Consequences

- Multi-event workspaces receive deterministic, isolated accommodation demand and allocation.
- Guests can state useful requirements without exposing organizer-only inventory.
- Organizers can turn a vetted recommendation into a real working stay without duplicate data entry.
- Provider limitations remain visible and machine-readable.
- Live price, availability and booking integrations require a separate launch decision and compliance review.
