# ADR 0030: Online payment provider contract

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

Slice 5 records payments performed outside WeddingOS. Slice 6 adds online checkout while keeping card data and custody of funds outside WeddingOS.

## Decision

`OnlinePaymentProvider` creates provider-hosted checkout, expires checkout, reads payment status, requests refunds and verifies webhooks. The local fake provider supplies a hosted local confirmation route and signed test webhooks. A configured adapter is selected only when its endpoint and secret are present.

The server derives workspace, currency, schedule, budget item, booking, contract, vendor and maximum outstanding amount from canonical records. The browser may request full outstanding or a custom amount, but cannot author the payable amount/currency/resource chain. Checkout is idempotent and expires. WeddingOS stores provider identifiers and a redacted payment-method summary only; PAN, CVV, track data, authentication secrets and raw provider payloads are prohibited.

Provider webhook signatures use raw bytes, timestamp tolerance, event-ID dedupe and a closed event mapping. Tenant identity comes from persisted provider checkout/payment IDs, never webhook fields. `OnlinePaymentTransaction` status is monotone. UI success means provider verification and internal projection completed, never merely a redirect return.

WeddingOS neither holds funds nor promises escrow, payout, settlement protection or fiscal invoicing.

## Consequences

- Manual external-payment recording remains available when online provider mode is disabled.
- Checkout and provider transaction lifecycle are distinct from the append-only internal `PaymentRecord` ledger.
- External provider limitations remain visible and do not create false success.
