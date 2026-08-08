# WeddingOS Slice 7 final handoff

Date: 2026-07-20  
Scope: verified reviews, marketplace trust, vendor subscriptions, entitlements, connected payout accounts, platform fees, settlements and payouts  
Verdict: **READY FOR SLICE 8**

## Reviews

- `ReviewEligibility` is generated only from a persisted `COMPLETED` booking and an authorized wedding membership. One eligibility can produce one active review; anonymous and favorite-derived reviews do not exist.
- `VendorReview` owns the lifecycle, while immutable `VendorReviewVersion` and persisted criterion ratings preserve every edit. Draft, stale-write rejection, submit, publish, edit-window enforcement and audited withdraw are real API operations.
- Public publication is idempotent and exposes only verified, eligible content. Marketplace vendors with no qualifying reviews return an explicit no-rating state and never fabricated stars.
- A vendor can publish one public reply without editing the couple's review. Reports create private moderation intake; a vendor can create one private dispute with evidence statement. Neither private reporter nor dispute material crosses the public serializer.
- Platform moderation uses persisted platform grants, an auditable case state machine and immutable decisions. Moderation preserves review history and recomputes the public aggregate under a vendor-scoped lock.
- `VendorRatingAggregate` uses scaled integers and only published verified reviews. Public Marketplace list, aggregate, criterion distribution, report flow and vendor reply are connected to persisted data.
- Semantic review events project notifications and Activity with source-event dedupe; internal rating/moderation work is not presented as a user-visible background job.

## Subscriptions

- Canonical catalog state is represented by `SubscriptionProduct`, `SubscriptionPrice`, `SubscriptionPlan` and `SubscriptionPlanEntitlement`; catalog writes require explicit platform capabilities.
- `SubscriptionBillingProvider` isolates the domain from a provider. Deterministic fake and configured external adapters implement customer, checkout, portal, subscription read/cancel/resume and signed webhook verification.
- `VendorSubscription`, periods, invoice records, immutable history, entitlement snapshots and usage counters persist the effective commercial state. Server services enforce entitlements and usage before a restricted mutation; UI-only checks are not authoritative.
- FREE limits are effective before a vendor creates an explicit subscription. Trial eligibility is one-time and cannot be reset by a new checkout. Checkout is provider-backed and idempotent.
- Signed lifecycle events are ordered monotonically, persist invoice/period data and cannot regress state. `PAST_DUE` starts a bounded grace period; expired grace and terminal states use a non-destructive effective FREE fallback.
- Cancellation at period end and resume are replay-safe. Downgrade changes effective entitlement but never deletes vendor content.
- Vendor Billing shows the real catalog, current subscription, trial/grace state, usage and effective entitlements. Billing portal sessions are provider-backed and carry a deterministic request identity.

## Payouts

- `PayoutAccountProvider` isolates connected-account onboarding and payout execution. Fake and configured adapters support account creation/status, hosted onboarding, payout create/read and signed provider events.
- Connected-account records store provider IDs and capability/status projections only. WeddingOS does not store raw bank data, present itself as a wallet or claim escrow.
- Platform fee policies have explicit scope/priority/currency/basis-point/fixed/minimum/maximum rules. The selected policy and calculated amounts are snapshotted once on `MarketplacePaymentAllocation`; later policy edits do not rewrite history.
- Integer minor-unit calculations allocate captured marketplace payments exactly once. `VendorPayableEntry` is append-only and expresses payable, fee, hold, release, refund, dispute and compensating effects without editing confirmed financial history.
- Settlement calculation is deterministic per vendor, currency and period. Lines claim eligible ledger entries once; finalization is immutable and cannot combine currencies or silently include held/disputed value.
- Payout creation uses one durable payout plus per-idempotency-key attempts. Provider confirmation is required before `PAID`; failure can be retried without duplicating the payout or ledger effect.
- Refund after payout creates a negative carry-forward adjustment. Dispute open creates a hold, win releases it, loss converts it to the final negative effect. A provider return moves a paid payout to the terminal returned state and appends one compensation.
- Signed payout events are monotone, deduplicated and recoverable after provider success before internal acknowledgement. Vendor balance, settlement history, payout history and platform reconciliation use persisted state.

## Security

- Couple review reads/writes are workspace-scoped; vendor review/subscription/payout operations are organization-scoped; platform moderation/catalog/settlement operations require persisted platform grants. These contexts are independent.
- Forced PostgreSQL RLS protects every wedding- and vendor-scoped Slice 7 table. Application and worker use non-owner roles. Cross-workspace, cross-vendor and forged relationship tests fail closed.
- Private report, dispute, moderation note, provider payload, connected-account and financial detail serializers are capability-filtered and redacted.
- Subscription and payout webhooks verify raw-body HMAC-SHA256, timestamp tolerance, closed event mapping, payload hash and provider event ID uniqueness. Provider-supplied tenant IDs are never authoritative.
- Worker organization/workspace/aggregate identity is reloaded from persisted provider, outbox and aggregate records. Forged BullMQ/provider context is rejected.
- Delivery remains at-least-once with independently retryable `OutboxConsumerExecution` records and idempotent effects where supported; no universal exactly-once provider guarantee is claimed.

## Frontend

- Connected production pages: `/reviews`, `/marketplace`, `/marketplace/[id]`, `/vendor`, `/vendor/reviews`, `/vendor/billing`, `/vendor/payouts` and `/admin/trust`.
- Couple review states cover no eligibility, draft, validation, submit, publish, edit conflict, withdraw and failure without false success.
- Marketplace renders persisted review lists and aggregate values, provides a real report flow and shows an honest no-rating empty state.
- Vendor Review supports real reply and private dispute. Vendor Billing shows checkout/portal, trial, grace, cancellation/resume, entitlement and usage state. Vendor Payouts shows connected-account onboarding, balance, settlements and payout history.
- Vendor OS search is API-backed, capability-filtered and navigates to reviews, disputes, subscription, settlements and payouts without leaking private material.
- Platform Trust connects moderation, product/price catalog and settlement/payout actions. Overview quick actions navigate to the real operational page instead of mutating local state.
- Demo review mode remains local and emits zero real mutations. Attachments, tax invoices, in-app bank-data editing, advanced vendor analytics and general Copilot remain disabled/planned.
- The existing app layout, navigation, typography, spacing, colors, themes, responsive behavior and component language were preserved. No dashboard redesign was introduced.

## OpenAPI

- Six canonical Slice 7 controllers expose 51 active `/api/v1` operations across verified reviews, Marketplace trust, moderation, subscription catalog/lifecycle, connected accounts, balances, settlements, payouts and webhooks.
- Every active operation has concrete request, response and problem schemas, examples, security/capability metadata and status codes. Retryable creates document `Idempotency-Key`; versioned mutations document `If-Match`.
- Subscription and payout webhook contracts document provider path, raw signed envelope, `X-WeddingOS-Signature` and `X-WeddingOS-Timestamp`.
- The vendor search response is schema-backed and declares `vendor.organization.read`. No planned Slice 8 operation is accidentally active.
- Swagger Parser validation and the six repository OpenAPI contract suites pass; the Slice 7 suite verifies every active family and zero schema-less mutable operations.

## Database

- Live database: 67 migrations applied, 0 unfinished; schema is up to date.
- Slice 7 adds 34 persistence models and eight append-only migrations:
  - `20260720110000_slice_7_trust_monetization_core`
  - `20260720112000_slice_7_rls_integrity`
  - `20260720113000_slice_7_provider_worker_context`
  - `20260720114000_slice_7_moderation_intake_policies`
  - `20260720115000_slice_7_reporter_case_visibility`
  - `20260720116000_slice_7_provider_event_recovery`
  - `20260720117000_slice_7_payout_attempt_progress`
  - `20260720118000_slice_7_lifecycle_recovery`
- Unique constraints cover review eligibility, reply/dispute identity, provider-event dedupe, subscription/trial identity, allocation, settlement line, payout and payout attempt. Financial immutability and lifecycle guards are also enforced in PostgreSQL.

## Tests

Exact final results:

```text
Format: passed 1; failed 0; skipped 0
Lint: passed repository gate; failed 0; skipped 0
Typecheck: passed 7 workspace projects; failed 0; skipped 0
Unit: passed 103 (web 7, API 78, worker 18); failed 0; skipped 0
Integration: passed 35 (including 3 Slice 7 real-infrastructure journeys); failed 0; skipped 0
E2E: passed 139 (including 34 Slice 7); failed 0; skipped 0; retries 0
API build: passed 1; failed 0; skipped 0
Worker build: passed 1; failed 0; skipped 0
Frontend build: passed 65 routes in the final current checkout; failed 0; skipped 0
Route smoke: passed 57 canonical routes plus 7 explicit final routes; failed 0; skipped 0
OpenAPI validation: passed 6 suites with Swagger Parser; failed 0; skipped 0
Database migrations: passed 67 applied, 0 unfinished; failed 0; skipped 0
Provider fake integration: passed subscription, portal, webhook, connected account, payout, refund, dispute and return; failed 0; skipped 0
Persistent runtime: passed API + worker + web enabled and active; failed 0; skipped 0
Restart recovery: passed API + worker + web with new PIDs and healthy readiness; failed 0; skipped 0
```

`pnpm verify` completed successfully as one aggregate invocation. The final E2E run completed with 139/139 tests. The final production Next build includes the concurrently added public landing, privacy and terms routes and generated 65/65 routes. PostgreSQL, Redis, BullMQ worker, Mailpit, MinIO and ClamAV were healthy during the final runtime gate.

## Acceptance reconciliation

- Booking-backed eligibility, verified/versioned reviews, persisted criteria, duplicate prevention, public aggregate, vendor reply/dispute, moderation and honest Marketplace states are implemented and tested.
- Provider abstractions, fake providers, trial, renewal/invoice ordering, grace, cancel/resume, server-side entitlement/usage enforcement and non-destructive downgrade are implemented and tested.
- Connected account, onboarding, fee snapshot, allocation, append-only payable ledger, deterministic immutable settlement, payout/retry, refund/dispute adjustments, return and reconciliation are implemented and tested.
- Forced RLS, webhook security, worker context, Overview, capability-filtered Search, notification/activity projections, OpenAPI, registries, persistent runtime and restart recovery pass.
- There are zero production false-success controls in the implemented scope, zero failed tests and zero skipped tests.

## Limitations

### EXPECTED FOR NEXT SLICE

- Production provider accounts, secrets, webhook endpoints, connected-account program approval and provider certification remain deployment configuration. Local acceptance intentionally uses deterministic fake providers.
- Jurisdiction-specific tax documents, vendor tax onboarding, bank-account editing, advanced billing analytics, downloadable accounting statements and general Copilot are not activated unless a later slice defines their canonical contracts.
- Slice 8 product scope is intentionally not implemented here.

### TECHNICAL DEBT

- Provider reconciliation can only be as complete as the status/read capabilities offered by the configured adapter; WeddingOS does not claim universal external settlement truth.
- The Windows-mounted checkout is materially slower for TypeScript and Next builds. The persistent server correctly runs from the WSL-native runtime mirror.
- The OpenAPI generator emits a harmless pre-existing recursive-schema warning for nested planning items while Swagger Parser and all six validation suites still pass.

### BLOCKER

- None for Slice 8.

## Final verdict

**READY FOR SLICE 8**

Slice 8 was not started.
