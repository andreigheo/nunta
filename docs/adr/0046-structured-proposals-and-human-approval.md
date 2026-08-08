# ADR 0046: Structured proposals and human approval

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

Copilot may recommend useful changes but must not mutate authoritative wedding data directly or execute opaque provider payloads.

## Decision

Every mutable recommendation is a versioned `CopilotProposal` containing immutable proposal versions and ordered allowlisted actions. The review response includes current/proposed values, affected resources/users/dates, notifications, reversibility, required capabilities and risk classification.

Low risk requires confirmation. Medium risk requires explicit diff review. High risk requires an explicit approval screen and command-time revalidation. Critical/prohibited actions are never executable through Copilot. The prohibited set includes offer acceptance, contract acknowledgement/signing, online payment, refund, payout, settlement finalization, document deletion, Wedding Day publication, critical-incident resolution, review moderation and subscription changes.

Approval and execution require `If-Match` and `Idempotency-Key`. Execution maps each action to a named canonical command handler; there is no generic `/copilot/action`, arbitrary endpoint, SQL, code or shell path. Target identity, tenant, capability and version are reloaded before each command. Stale actions fail with conflict. Partial completion is explicit and every step is persisted.

## Consequences

- Provider text is never treated as a database command.
- Human reviewers see the effects before approval.
- Replay cannot duplicate supported canonical effects.
- Failed and partially completed proposals remain visible and auditable.
