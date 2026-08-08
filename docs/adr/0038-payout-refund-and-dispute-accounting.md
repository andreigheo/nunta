# ADR 0038: Payout refund and dispute accounting

Status: Accepted for Slice 7  
Date: 2026-07-20

## Context

Refunds and disputes can occur before or after settlement/payout. Rewriting a paid settlement would destroy the audit trail.

## Decision

A succeeded refund applies exactly one `REFUND_ADJUSTMENT` to the allocation/payable ledger. Before payout it reduces eligibility; after payout it becomes negative carry-forward. Historical finalized settlements and paid payouts remain immutable.

A dispute opens `DISPUTE_HOLD` for the bounded affected amount. Payout calculation excludes held funds. A won dispute creates `DISPUTE_RELEASE`; a lost dispute creates the final negative adjustment/carry-forward. Provider events are monotonic and deduplicated. No automatic dispute-evidence submission is implemented.

Payout reconciliation compares nonterminal persisted payout/provider state through bounded provider APIs. It reuses the same idempotent transition and ledger functions. At-least-once provider calls are documented; unique source bindings prevent duplicate internal financial effects.

## Consequences

- Confirmed ledger entries are append-only.
- Refund, dispute and return recovery remain auditable across crashes and replays.
- Provider state is evidence, not a reason to accept tenant context from payload.
