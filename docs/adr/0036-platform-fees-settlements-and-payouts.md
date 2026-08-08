# ADR 0036: Platform fees, settlements and payouts

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

Slice 6 records provider capture and refund in the wedding ledger but does not allocate marketplace revenue or pay vendors. WeddingOS must not behave as a wallet or claim provider settlement before confirmation.

## Decision

Every captured booking payment creates one `MarketplacePaymentAllocation`. It snapshots the selected `PlatformFeePolicy`, applies integer-minor-unit and basis-point math with half-up rounding and enforces `gross = platform fee + vendor net` before adjustments.

`VendorPayableEntry` is append-only. Earned value, fee, refund adjustment, dispute hold/release, reserve, payout and payout reversal are compensating entries, never edits. Balance is derived per vendor and currency.

`VendorSettlement` and immutable `VendorSettlementLine` rows are calculated deterministically for one vendor/currency/period. Finalization locks the eligible lines. A payout is created only from one finalized settlement, under an idempotency key and transaction lock; provider confirmation alone moves it to `PAID`. Retry adds `VendorPayoutAttempt`, and returned payout creates a compensating ledger entry.

## Consequences

- No currency mixing or implicit FX.
- Policy changes do not alter historical allocations.
- WeddingOS exposes provider payout eligibility, not a stored-value wallet or escrow promise.
