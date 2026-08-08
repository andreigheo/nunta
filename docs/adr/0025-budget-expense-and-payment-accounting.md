# ADR 0025: Budget, expense and payment accounting

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

Budget and payment screens currently calculate totals from floating-point-like frontend numbers and local arrays. WeddingOS needs a consistent ledger while explicitly not processing funds.

## Decision

`BudgetPlan` has one active instance per workspace and one canonical workspace currency. `BudgetCategory` supports one parent level and allocation. `BudgetItem` is the canonical commercial commitment link for manual items or one RFQ/offer/booking/contract source. Unique source constraints prevent duplicate booking/contract projections. `ExpenseRecord`, `PaymentScheduleEntry` and `PaymentRecord` preserve operational spending and manual external-payment evidence.

All amounts are non-negative integer minor units. Arithmetic uses checked safe integers. Currency must match the workspace and active budget plan; Slice 5 performs no FX conversion. Server-side formulas are:

```text
allocated = sum(active category allocated)
estimated = sum(active item estimated)
quoted = sum(active item quoted)
committed = sum(active item committed)
paid = sum(valid non-reversed payment records)
outstanding = max(committed - paid, 0)
remaining = target - committed
forecast = committed + estimated for uncommitted active items
contingency = target * contingency_percent / 100
```

Cancelled items and cancelled schedules are excluded. Reversed/refunded payments do not contribute to paid totals; a reversal is an explicit transition and never a destructive edit. Over-budget and over-allocation produce warnings/events but do not silently block valid commitments.

Payment schedule state is derived from due date and applied payments where possible. `PaymentRecord` represents an external payment recorded by a user with method `BANK_TRANSFER`, `CARD_EXTERNAL`, `CASH`, `CHECK` or `OTHER`. The UI says `Înregistrează plată efectuată extern`; it never says `Plătește acum` or `Plătit prin WeddingOS`. Payment creation/transition atomically updates schedule, item and booking totals plus outbox/activity.

Payment reminders use a version-aware, access-aware `payment_reminder` consumer and `availableAt`. A stale, paid, cancelled, rescheduled or inaccessible entry is a no-op. Budget/payment/booking exports use requester-bound generated artifacts; receipt upload remains disabled.

## Consequences

- Frontend charts and summaries render server values and are not financial authority.
- Double-click/retry cannot duplicate commitments or payments.
- Manual external records are clearly distinguished from processor settlement.
- Multi-currency conversion, fiscal invoices, escrow, payout and provider refunds remain out of scope.

## Mandatory financial hardening amendment

The workspace currency is the single operational currency. RFQ, offer, booking, contract totals, budget plan/item, payment schedule and payment ledger entries must equal it. Vendor public catalog prices may use another currency but cannot enter the operational chain without an explicitly matching offer; Slice 5 performs no conversion. A mismatch returns typed `CURRENCY_MISMATCH` and commits no partial state.

Financial source bindings are durable: budget projection uses one canonical chain key and never creates a second item as an offer advances through accepted offer, booking and agreed contract; contract-derived schedule rows are unique by source contract version and sequence, while active manual schedules retain budget-item/sequence uniqueness. Superseded contract schedules remain as cancelled history instead of being overwritten. Precedence is `manual estimate -> submitted quote -> accepted offer/booking -> effective contract -> confirmed payment ledger`. A user may set an explicit manual override with author, reason and timestamp; later projections retain and surface that override instead of silently overwriting it. Booking cancellation cancels future unpaid schedule projections and removes the commitment from active forecast while preserving history.

Confirmed payments are append-only. Ordinary payment records always have a positive amount and entry type `PAYMENT`. `REVERSAL` and `REFUND` are new positive compensating records linked to the original confirmed payment; they do not mutate its amount, date, method, currency, reference, source links or confirmation metadata. One full reversal is allowed, refunds may be partial, and the sum of reversal/refund adjustments cannot exceed the original confirmed amount. Paid totals are `confirmed payments - confirmed compensating entries`; recorded/unconfirmed, disputed, cancelled and negative ordinary records never count. Database constraints and an immutability trigger protect these rules in addition to service validation.

All finance UI text remains truthful: WeddingOS records an external payment or adjustment and never claims to process, settle or refund funds.
