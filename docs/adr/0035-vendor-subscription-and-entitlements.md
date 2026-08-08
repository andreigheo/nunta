# ADR 0035: Vendor subscription and entitlements

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

Vendor OS currently has no billing customer, subscription or server-side commercial limits. UI-only plan gates would be bypassable and downgrade must not destroy historical commercial data.

## Decision

`SubscriptionBillingProvider` is provider-neutral and has deterministic fake and configured adapters. Raw provider states map to canonical `VendorSubscription` states. Signed, timestamp-bounded events enter `SubscriptionProviderEvent`, are resolved through persisted provider customer/subscription IDs and are monotonic and replay-safe.

Products, prices, plans and `SubscriptionPlanEntitlement` values live in the database. `VendorEntitlementSnapshot` versions the effective plan; `VendorUsageCounter` stores bounded current-period usage. Every protected command checks capability, entitlement and usage server-side. Downgrade retains existing resources and makes over-limit creation unavailable; booking/contract history remains readable.

Trial history is persistent and one-time per organization/policy. Past-due enters a configured grace period, emits notification/activity and then applies the explicit fallback plan without deleting resources. Checkout and portal URLs are provider-hosted and expiring. WeddingOS stores only redacted invoice metadata.

## Consequences

- Plan catalog is configurable and UI is not hardcoded to four plans.
- Provider delivery is at-least-once; internal entitlement effects are idempotent.
- Existing vendor data remains accessible after cancellation or downgrade.
