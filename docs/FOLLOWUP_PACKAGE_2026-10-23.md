# Sarbato follow-up package — 23 October 2026

## Scope and target

Continue the live review from revision `40944c8`, on `51.195.86.175` / `vps-c078631a`, domain `https://sarbato.space`. The original user checkout is preserved. External backup is explicitly excluded by the user; existing local backup automation is retained.

## Changes

- Accommodation: bounded failover between the configured Overpass instance and Private.coffee; the existing validated outbound HTTP transport, OSM attribution, cache isolation, stale-cache age limit and non-booking semantics remain. Unavailable searches no longer say `0 variante`. No prices, inventory or results are invented. Document the alternative operator in the privacy notice and example configuration.
- Billing: check provider state before expiring an abandoned checkout. Cancel only API/web draft or ready transactions with no payment attempts, no subscription binding, and at least a day beyond local checkout expiry. Require a confirmed matching Paddle cancellation before local expiration. Preserve pending/authorized/paid/unknown outcomes. Checkout creation no longer expires known or uncertain provider transactions locally, and refuses to reuse terminal expired sessions.
- Billing recovery: the SQL claim function retries beyond the old 12-attempt ceiling with hourly backoff, including recovery-pending rows that have a known provider transaction. The migration changes only a function and its grants; it does not rewrite customer rows.
- Free documents: explain the plan limit and link to billing. Distinguish a plan restriction from a membership permission restriction. Empty-state copy reflects the actual upload capability; the mobile folder control has an accessible name.
- Event copy: neutral organizer/co-organizer guest-side labels outside weddings, including the mobile guest list, quick creation and campaign segment selector. Persisted side identifiers are unchanged. Display legacy wedding-day task categories as `Ziua evenimentului`.
- New RSVP forms: defaults depend on event type; corporate forms start without plus-one/children and optional menu, transport or accommodation questions. Existing saved forms keep their settings.
- Public page: remove invented people, supplier identities, budgets, ratings and usage figures from operational previews. Numeric metrics use only the validated aggregate; suppressed metrics say `Cohortă insuficientă`; unavailable metrics show a dash. Progress bars never invent a percentage.
- Production web build includes the existing configured GTM container `GTM-59ST3B86`; consent enforcement is tested. GA4 administrative reporting still requires a property and server-side authorization.

## Paddle read-only reconciliation before changes

All nine locally recorded checkout transactions and three subscriptions were queried directly in Paddle production. Three completed checkouts match Paddle and have zero-valued totals. The three locally open expired checkouts have draft/ready status and no payment attempts at Paddle. Historical expired checkouts include an action-required payment and are not included in the targeted cleanup.

All three PAST_DUE subscriptions match Paddle. Their recurring transactions report `declined_not_retryable` (EUR 27, 27 and 59). This requires the account holder to update the payment method; no charge or subscription cancellation is initiated by this package.

## Validation before deployment

- Full unit run: web 164, API 310, worker 51 passed. Final focused API run: 59 passed, including an additional expired-session regression.
- Lint and workspace typecheck passed; nine existing Next navigation warnings remain.
- Full production build passed; the final web build includes the last quick-create label change and the production public build configuration.
- Isolated landing build and 41-test suite: 38 initially passed, one consent test intentionally skipped without a configured test GTM container, two required rechecks. Both rechecks passed: allow the truthful vendor placeholders to wrap, and rerun the animation timing check. Final production-build consent checks: 2 passed, including actual GTM configuration with network interception.
- Integration slices: 22 core API tests and 6 commercial tests passed with a non-hidden temporary artifact path; all 8 guest/RSVP tests passed with an adequately nested temporary import/export root. Earlier local failures were Express hidden-path denial and an overly shallow temporary root, not production-path failures.
- Migration tested against the isolated integration database with transaction rollback: exhausted checkout retried, hourly backoff respected, completed checkout untouched.
- Read-only production migration preflight verified the production database identity and all 126 applied migration checksums. Only `20261023110000_checkout_reconciliation_recovery` is pending.
- Production dependency audit: zero vulnerabilities across 611 dependencies. Candidate image scan is required before activation.
- Built local route smoke: 92/92 passed.

## Deployment and final evidence

Pending activation and live verification. Deployment evidence will be appended after completion.

## External limitations

- Both tested public Overpass instances were unavailable or timed out from the production server. Geocoding worked. Failover and correct unavailable-state presentation improve resilience but cannot guarantee a public provider's capacity.
- Existing past-due subscriptions need a valid payment method from the holder.
- GA4 reporting needs property access and server-side credentials. A browser tag alone does not provide report API access.
- External backup is excluded at the user's explicit request.
- Previously documented system-image advisories without available fixes and the development-only braces advisory remain subject to monitoring; do not claim the entire VPS is vulnerability-free.
