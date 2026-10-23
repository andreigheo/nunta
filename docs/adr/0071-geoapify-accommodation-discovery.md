# ADR 0071: Managed accommodation discovery on Geoapify Free

- Status: Accepted
- Date: 2026-10-23
- Extends: ADR 0069

## Decision

Production selects Geoapify explicitly with `ACCOMMODATION_DISCOVERY_PROVIDER=geoapify` and a server-only `GEOAPIFY_API_KEY`. The project stays on Free; no paid subscription or automatic plan upgrade is authorized. The existing OpenStreetMap adapter remains available through explicit configuration, without silently switching sources on failure.

Geoapify supplies geocoding and proximity searches for the six existing accommodation categories. Fetch at most 100 nearby records per new search, then apply existing local filters and the 80-result UI limit. Warn when the source catalogue reaches its cap. The provider does not assert live prices, availability, date/occupancy inventory, or booking capability.

Validate source responses and individual records, omit malformed or out-of-radius places, and preserve source identifiers, observation time, contacts actually present, and Geoapify/OpenStreetMap attribution. Recommendations use the additive `GEOAPIFY` database enum; existing OSM recommendations remain unchanged. Attribution is visible in search, saved recommendation details, and guest recommendations.

Cache remains workspace scoped. Provider is part of geocoding and discovery cache identities, preventing old OSM results from being labelled as Geoapify. Retain the 6h discovery cache, 30d geocoding cache, and explicitly dated stale results no older than 7d. Without a usable snapshot, show unavailable rather than claiming the area has no properties.

Before every upstream call, Redis atomically reserves the maximum credit cost in a shared rolling 24h window: at most 2700 credits and 4 calls in any rolling second. This leaves headroom below Free's published 3000 credits/day and 5 requests/second. Failed calls retain their reservation. Redis failure prevents upstream calls; it cannot disable the budget. The account's dashboard remains the authority for actual billed usage, including manual calls outside Sarbato.

Requests use the existing pinned-DNS outbound client, a fixed HTTPS origin, no redirects, bounded responses, and a 6s timeout. The API key is never returned to clients, logged, put in public environment variables, or sent to an arbitrary endpoint. Only coordinates/radius/types or the entered location text go to Geoapify; guest/account data is excluded. The privacy notice describes the provider.

## Consequences

The Free plan has no paid-plan availability SLA. Cached recommendations and manual entry remain necessary during outages or quota exhaustion. Coverage and missing contacts depend on the open dataset. Paid plans, booking inventory, and provider outreach require separate authorization.

## References

- https://apidocs.geoapify.com/docs/places/
- https://apidocs.geoapify.com/docs/geocoding/
- https://www.geoapify.com/pricing/
- https://www.geoapify.com/terms-and-conditions/
- https://www.geoapify.com/products-and-services/
