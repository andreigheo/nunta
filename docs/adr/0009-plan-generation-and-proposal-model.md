# ADR 0009: Plan generation and proposal model

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2B plan generation, human review, and atomic apply

## Context

Slice 2A leaves onboarding in `READY` and deliberately creates no plan. Slice 2B must turn the versioned onboarding document into a useful planning structure without allowing a generator or external AI provider to create authoritative tasks directly. Generation must remain available without an external provider, survive process/Redis failure, and preserve the existing outbox/worker/RLS guarantees.

## Decision

Plan generation is an explicit user command, not an automatic consequence of onboarding completion. `POST /api/v1/workspaces/:workspaceId/plan-generations` requires both `If-Match` for the READY onboarding version and `Idempotency-Key`. The transaction creates a user-visible `BackgroundJob`, `PlanGenerationRun`, `OutboxMessage`, and per-consumer executions. The dedicated `plan_generation` consumer derives workspace and actor only from the persisted execution/outbox relation.

The provider boundary is:

```ts
interface PlanGenerationProvider {
  generatePlan(input: PlanGenerationInput): Promise<PlanGenerationOutput>;
}
```

`DeterministicPlanProvider` always exists and establishes the minimum required coverage. `ConfiguredAiPlanProvider` is optional. In `auto`/`ai_enriched`, a configured provider may refine titles, descriptions, ordering, assumptions and warnings; its output is schema-validated and merged against the deterministic minimum. Provider absence/failure falls back to deterministic output and persists `fallbackUsed=true`, a safe warning and provider metadata. The UI never labels fallback output as AI-generated.

The generator produces a versioned `PlanProposal` and ordered `PlanProposalItem` tree (`PHASE`, `MILESTONE`, `TASK`). It records the onboarding version, normalized input hash, rules/provider version, generator type, assumptions, warnings and coverage result. Missing information is an assumption, never invented data. Future-domain task categories are allowed, but vendor/payment/contract/guest/budget foreign references remain absent.

A proposal is always reviewed before apply. PATCH edits proposal/item attributes with `If-Match`; required items need explicit confirmation plus a persisted exclusion reason. Reject is explicit. Apply requires `If-Match` and `Idempotency-Key`, locks the proposal, validates coverage and atomically creates phases, milestones, tasks/subtasks/dependencies, marks the proposal `APPLIED`, and emits one `planning.plan_applied.v1`. A rollback leaves zero partial domain rows and the proposal reviewable. Replay returns the existing applied result.

Only one nonterminal/ready proposal can exist for a workspace plus onboarding version. A proposal for a newer onboarding version supersedes the older proposal only after the new proposal reaches `READY_FOR_REVIEW`.

## Consequences

- Generator output is a proposal, never authoritative tasks.
- Deterministic generation is the availability and coverage floor.
- AI is replaceable, optional, bounded to generation and unable to bypass validation/human apply.
- Generation is a visible background job; proposal edit/apply are synchronous authoritative transactions.
- Input/version hashes make replay, regeneration and supersession auditable.
