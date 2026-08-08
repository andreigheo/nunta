# WeddingOS Slice 7 implementation plan

Date: 2026-07-20  
Status: IMPLEMENTED AND FINAL-GATE VALIDATED

## Baseline gate

- `pnpm verify`: passed before code (format, lint, 7-project typecheck, 73 unit, 32 integration, API/worker/frontend production build, 59 routes).
- Existing E2E: 105 passed, 0 failed, 0 skipped, 0 retries.
- Database: 59 applied, 0 unfinished migrations.
- PostgreSQL, Redis, Mailpit, MinIO, ClamAV, API, worker and web: healthy.
- Audit result: `/reviews` is seed/local false success; settings subscription is planned; payout/connected-account models do not exist; public marketplace currently refuses fake reviews.

## Models

Reviews: `ReviewEligibility`, `VendorReview`, `VendorReviewVersion`, `VendorReviewCriterionRating`, `VendorReviewReply`, `VendorReviewReport`, `VendorReviewDispute`, `VendorReviewModerationCase`, `VendorReviewModerationDecision`, `VendorRatingAggregate`.

Subscriptions: `SubscriptionProduct`, `SubscriptionPrice`, `SubscriptionPlan`, `SubscriptionPlanEntitlement`, `VendorSubscription`, `VendorSubscriptionPeriod`, `VendorEntitlementSnapshot`, `VendorUsageCounter`, `SubscriptionProviderEvent`, `SubscriptionInvoiceRecord`, `SubscriptionCheckout`, `VendorSubscriptionHistory`.

Payouts: `VendorPayoutAccount`, `VendorPayoutCapability`, `VendorPayoutOnboardingSession`, `PayoutProviderEvent`, `PlatformFeePolicy`, `MarketplacePaymentAllocation`, `VendorPayableEntry`, `VendorSettlement`, `VendorSettlementLine`, `VendorPayout`, `VendorPayoutAttempt`.

## Migration order

1. `20260720110000_slice_7_trust_monetization_core` — review, subscription, connected-account, allocation, settlement and payout core.
2. `20260720112000_slice_7_rls_integrity` — catalog seed, capabilities, forced RLS, constraints and immutable financial guards.
3. `20260720113000_slice_7_provider_worker_context` — persisted provider-to-vendor actor resolution for subscription and payout webhooks.
4. `20260720114000_slice_7_moderation_intake_policies` — reporter/moderator intake boundaries.
5. `20260720115000_slice_7_reporter_case_visibility` — narrow reporter ownership policy without platform leakage.
6. `20260720116000_slice_7_provider_event_recovery` — provider inbox crash recovery and processing-state policies.
7. `20260720117000_slice_7_payout_attempt_progress` — durable payout attempt progress and worker/provider acknowledgement recovery.
8. `20260720118000_slice_7_lifecycle_recovery` — per-attempt idempotency, terminal return compensation and lifecycle guards.

Applied migrations are append-only; corrective changes receive a new migration.

## Provider interfaces

- `SubscriptionBillingProvider`: customer, checkout, portal, subscription read/cancel/resume and signed webhook verification.
- `PayoutAccountProvider`: connected account, onboarding link, account status, payout create/read and signed webhook verification.
- Both have `Fake*Provider` and `Configured*Provider`; configured mode requires endpoint/secret and never changes domain contracts.

## Domain policies

- Review eligibility is generated from `COMPLETED` booking plus active authorized wedding member; one active review per eligibility.
- Review versions are immutable. Edit uses a new version inside the 30-day window; later additions preserve the original.
- Moderation is a separate platform workflow; decisions preserve prior state and private material.
- Rating is recomputed in scaled integers from public eligible reviews under a vendor lock.
- Subscription states map to canonical lifecycle; trial is one-time; `PAST_DUE` starts grace; expiry applies a non-destructive fallback.
- Entitlements and usage limits are enforced in API services, not only UI.
- Fee policy selection is scope-priority based and snapshotted at allocation. Money uses safe integer minor units and basis points.
- Captures allocate once; payable ledger is append-only; hold period, refund and dispute state determine eligibility.
- Settlement is one vendor/currency/period, deterministic and immutable after finalization.
- Payout is one winner per settlement, idempotent and `PAID` only after provider confirmation.
- Refund after payout and payout return create negative carry-forward/compensating entries; no historical rewrite.

## API operations

Implement all canonical operations from the Slice 7 prompt under:

- wedding reviews: `/api/v1/workspaces/:workspaceId/review-eligibilities` and `/reviews`;
- vendor reviews: `/api/v1/vendor-organizations/:organizationId/reviews` and disputes/reply;
- public rating: `/api/v1/marketplace/vendors/:slug/reviews|rating-summary`;
- moderation: `/api/v1/platform/review-moderation`;
- subscription catalog/vendor lifecycle: `/api/v1/vendor-subscription-plans`, `/vendor-organizations/:organizationId/subscription*`;
- platform subscription catalog: `/api/v1/platform/subscription-products|subscription-prices`;
- payouts: `/api/v1/vendor-organizations/:organizationId/payout-account|balance|settlements|payouts`;
- platform settlements: `/api/v1/platform/settlements`;
- webhooks: `/api/v1/webhooks/subscriptions/:provider` and `/payouts/:provider`.

Mutating create/retry operations require `Idempotency-Key`; versioned mutations require `If-Match`. Platform routes require explicit platform capability and never support impersonation.

## Events, consumers and visible jobs

Use the prompt's closed event list. Consumer allowlist: `review_eligibility_projection`, `review_rating_projection`, `review_notification_projection`, `review_moderation_projection`, `subscription_status_projection`, `subscription_entitlement_projection`, `subscription_usage_projection`, `subscription_notification_projection`, `payment_allocation_projection`, `vendor_payable_projection`, `settlement_calculation`, `payout_execution`, `payout_status_projection`, `payout_reconciliation`, shared notification/activity and `event_ack`.

Visible jobs are limited to settlement batches, payout batches/reconciliation, rating rebuild and moderation export. Consumer executions stay internal.

## Capabilities and RLS

Add every atomic review/subscription/payout/platform capability from the prompt to role templates and `PERMISSION_MATRIX.csv`. Wedding, vendor and platform contexts remain independent. Every tenant table has forced RLS. Public reads use narrow published serializers. Provider and worker flows resolve persisted aggregate relationships; missing or forged context fails closed.

## Frontend

- Replace `/reviews` seed state with eligibility/draft/publish/edit/withdraw/report API flows.
- Add real reviews/aggregate/distribution/reply to `/marketplace/[id]`.
- Add Vendor OS review, billing and payout pages plus overview actions.
- Replace settings placeholder with real vendor plan catalog where vendor context applies; keep wedding billing copy honest.
- Add limited admin moderation/subscription/settlement/payout tabs without redesigning the shell.
- Keep demo state local and zero-network. Remove production fake stars, wallet wording and success-only local mutations.

## Testing and exact order

1. ADR/plan and baseline audit.
2. Prisma models plus review migration/RLS.
3. Review service/controllers, aggregate, UI and tests.
4. Subscription models/providers/service/controllers, entitlements, UI and tests.
5. Payout models/providers/allocation/ledger/settlement/service/controllers, UI and tests.
6. Webhooks, outbox consumers, notification/activity/overview/search projections and isolation/crash tests.
7. OpenAPI and four registries/permission matrix.
8. Minimum 28 Slice 7 unit cases, real-infrastructure integration assertions and 20 fresh E2E scenarios.
9. Full `pnpm verify`, minimum 125 E2E with zero skipped/retries, migration/OpenAPI/route gates.
10. Sync to `/home/andrei/weddingos-runtime`, migrate/build/restart, manual health and restart-recovery proof.

Slice 8 is explicitly excluded.

## Final implementation evidence

- Prisma: 34 Slice 7 persistence models including platform grants; 8 append-only Slice 7 migrations; 67/67 repository migrations applied.
- API: 51 active controller operations with concrete shared request/response/problem schemas in canonical OpenAPI.
- Domain: 29 Slice 7 unit cases passed; the dedicated real-infrastructure Slice 7 integration suite passed 3/3.
- E2E: 34/34 Slice 7 scenarios and 139/139 repository scenarios passed with zero failed, skipped or retries.
- Frontend: real couple review lifecycle, marketplace rating/report, vendor reply/dispute, subscription/portal/entitlements and connected payout/settlement views; existing design system preserved.
- Recovery: stale subscription event, grace expiry, refund-after-payout, dispute win/loss, payout return and failed-payout retry have persistent test evidence.
