# ADR 0037: Connected account and provider onboarding

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

Payout destination and capability state must come from an external provider without storing bank-account data or trusting webhook tenant identifiers.

## Decision

`PayoutAccountProvider` has fake and configured adapters for account creation, onboarding links, account refresh, payout creation/status and webhook verification. `VendorPayoutAccount` stores only provider account ID, country/currency, capability booleans, requirement keys and redacted disable reason. `VendorPayoutOnboardingSession` stores an expiring provider link reference, never bank data.

Signed raw-body events enter `PayoutProviderEvent` with provider/event uniqueness. Organization context is resolved exclusively through persisted provider account/payout IDs. A claimed vendor ID in payload or BullMQ data is non-authoritative and forged-context tests must fail closed.

## Consequences

- Payout is unavailable until the persisted account is `ACTIVE` and payouts are enabled.
- Provider-hosted onboarding can expire and be regenerated idempotently.
- Public and wedding-side APIs have zero access to payout account data.
