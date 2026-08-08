# ADR 0031: Payment webhook and ledger reconciliation

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

Provider delivery is at least once and may arrive duplicated or out of order. A captured payment must update the existing financial chain once, while a refund must compensate rather than rewrite history.

## Decision

`PaymentProviderEvent` is the append-only provider inbox. Verified events are unique by provider/event ID and store only type, identifiers, payload hash and processing state. `OnlinePaymentTransaction` uses explicit precedence; terminal/financial states cannot regress. Older events may fill missing timestamps or redacted metadata but cannot reverse state or repeat effects.

First verified `CAPTURED` creates exactly one confirmed `PaymentRecord` with `sourceType=ONLINE_PAYMENT` and `sourceId=transaction.id`. A database unique binding protects the projection. Schedule, budget item and booking totals update in the same transaction as that ledger insert. A duplicate event is a no-op.

Refund requests require `Idempotency-Key` and `If-Match`, then reserve against all `REQUESTED`, `PROCESSING` and `SUCCEEDED` refunds under a transaction advisory lock. Reserving increments the transaction version, so a concurrent stale command fails rather than silently oversubscribing captured value. The provider receives the durable refund ID as its idempotency identity. A replay of a request left `REQUESTED` or `PROCESSING` resumes provider reconciliation, covering the provider-success-before-internal-acknowledgement crash window.

Only provider `SUCCEEDED` creates a positive append-only `REFUND` compensation linked to the original online payment. The debit sign is derived from `entryType`, never represented by an invalid negative stored amount. A unique `sourceType=ONLINE_REFUND` plus `sourceId=refund.id` binding makes the ledger effect idempotent. Partial and full refunds never mutate or delete the captured record; failures leave budget, booking and schedule unchanged. Over-refund is rejected before the provider call and rechecked under the completion lock.

`PaymentReconciliationRun` compares nonterminal provider transactions with provider state using a bounded internal/admin operation. It reuses the same idempotent event/projection functions. A dispute marks the provider transaction disputed and notifies the organizer but does not invent a chargeback ledger entry.

## Consequences

- Database effects are effectively once where unique source keys exist; provider interaction remains at least once.
- Reconciliation repairs missed webhooks without a second ledger effect.
- Financial totals remain reproducible from append-only entries.
