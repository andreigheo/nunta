# ADR 0018: Deterministic seating suggestions

- Status: Accepted
- Date: 2026-07-19
- Slice: 4

## Context

An automatic seating action must be explainable, work without an external provider, preserve manual/locked work and never invent social relationships. It must also follow the established generated-proposal pattern: durable job, human review, explicit apply.

## Decision

`SeatingSuggestionRun` tracks the visible job and rules version. `SeatingSuggestion` stores the reviewable proposal, score, warnings, conflicts, unassigned guest IDs and utilization. `SeatingSuggestionAssignment` stores proposed guest/table/seat rows and never changes the live plan by itself.

The `seating_suggestion` consumer derives workspace, plan and actor from persisted outbox/execution records. BullMQ payload workspace data is never authority. The deterministic engine applies rules in this order:

1. no capacity, duplicate guest or duplicate seat violation;
2. preserve locked tables and active manual assignments;
3. satisfy required constraints;
4. keep plus-one with the primary guest;
5. keep children and households together;
6. satisfy accessible-seat requirements;
7. minimize unassigned guests;
8. balance utilization;
9. improve optional preferences.

The score is derived only from these documented rule weights. No social compatibility or AI confidence is generated. A proposal with hard conflicts remains reviewable but cannot be applied without explicit supported overrides.

Generation and apply require `Idempotency-Key` and `If-Match`. Apply revalidates the current plan version, eligibility, locks and capacities, then writes assignments atomically and emits one aggregated semantic event. It does not modify locked/manual work unless the request explicitly confirms the affected IDs.

Delivery is at-least-once with idempotent internal effects. Suggestion readiness uses aggregate notification/activity projections, never one row per guest.

## Consequences

- Suggestion generation remains available without an external provider.
- Review and apply are separate authoritative operations.
- Explanations and conflicts can be reproduced from a stored rules version.
- Partial worker success can retry without duplicating proposals or assignments.
