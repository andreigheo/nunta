# ADR 0023: RFQ, offer and negotiation lifecycle

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

The existing RFQ and offer screens mutate page-local arrays. Slice 5 needs durable recipient isolation, immutable submitted offers, deterministic totals and a shared conversation without exposing competing vendors.

## Decision

`RequestForQuote` is wedding-owned and versioned. Its requirements and questions are canonical children. Its award policy is explicit: Slice 5 exposes only `SINGLE_AWARD`; `MULTIPLE_AWARD` is reserved in the data model and rejected by active API schemas. `RfqRecipient` links one selected vendor while `RfqRecipientSnapshot` freezes the public vendor identity and RFQ-visible brief at send time. Sending locks the recipient set, commits one `rfq.sent.v1` event and uses the `rfq_delivery` consumer. Vendor inbox queries only addressed recipient rows; a vendor never receives recipient lists or competing responses.

RFQ state changes use a closed state machine: draft to sent/open, then closed/cancelled/archived. Draft edits and recipient replacement require `If-Match`; create/send require `Idempotency-Key`. Attachments and open-public RFQs remain disabled.

`VendorOffer` belongs to the addressed vendor and RFQ. Every draft submission creates an immutable `VendorOfferVersion` with line items and answers. A submitted version cannot be edited; revision creates a new version and retains prior hashes. All monetary values use integer minor units and one currency. The server calculates selected line subtotals, offer subtotal, discount, taxable base, tax and total with positive quantity, bounded percentage and safe-integer overflow checks. Optional unselected lines contribute zero.

Wedding review is a separate state machine (`START_REVIEW`, `REQUEST_REVISION`, `ACCEPT`, `REJECT`, `ARCHIVE`). The wedding can select optional items for comparison/acceptance but cannot alter vendor-authored price data. Accept requires `If-Match` and `Idempotency-Key` and atomically accepts exactly one immutable offer version, creates booking/contract/budget projections and emits one `offer.accepted.v1`.

`NegotiationThread` is the cross-tenant conversation anchor and `NegotiationMessage` stores bounded plain text. Sender membership is verified for its side. System messages are immutable; normal edits have a bounded window. Activity and notifications contain only safe summaries and never the full message body.

## Consequences

- Offer comparison is deterministic and explainable, with no fabricated AI winner or ratings.
- Competing vendors cannot read each other's presence, offers, prices or messages.
- Retries cannot duplicate recipients, submitted versions, deliveries or accepted bookings.
- Provider delivery remains at-least-once with idempotent internal effects.

## Mandatory award and acceptance hardening amendment

`SINGLE_AWARD` permits one accepted offer and one source booking per RFQ. Acceptance obtains a database transaction-scoped advisory lock for the RFQ and relies on a partial unique database constraint for the winning offer. Concurrent attempts have one winner; the loser receives `RFQ_ALREADY_AWARDED`. An idempotent replay of the winning request returns the existing booking/contract chain.

Within the same transaction, acceptance verifies: the RFQ remains awardable; the offer is reviewable and not expired; the recipient and vendor organization are active; the vendor profile is still in an acceptable publication state; offer, RFQ and workspace currencies are identical; current offer/RFQ versions match the preconditions; persisted server totals equal the accepted immutable version; the requested service range remains explicitly available; and the award policy permits the result. Failure creates no booking, contract, budget item, schedule or competing-offer transition.

RFQ progress is aggregate data returned by the API: recipient totals by `PENDING`, `QUEUED`, `SENT`, `OPENED`, `RESPONDED`, `DECLINED`, `FAILED`, `EXPIRED` and `CANCELLED`, plus award status. API success after send means the RFQ and durable per-recipient delivery intents were committed; it does not claim that every recipient was delivered. Each recipient has an internal `OutboxConsumerExecution`, not a user-visible background job.
