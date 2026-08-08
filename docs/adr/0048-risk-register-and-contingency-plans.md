# ADR 0048: Risk register and contingency plans

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

The existing `/risks` page uses seed data and local success toasts. Risks and Plan B require canonical lifecycle, deterministic scoring and approval-gated execution.

## Decision

`Risk` is the canonical register entry. Probability and impact use five-level enums; the server calculates score with matrix version `risk-matrix.v1` (`1..5 × 1..5`) and bands LOW 1–4, MEDIUM 5–9, HIGH 10–16, CRITICAL 17–25. AI may suggest an assessment, but an organizer confirms it before canonical score changes.

The deterministic detector produces deduplicated `RiskSignal` and draft assessments from canonical task, budget/payment, offer/contract, guest/capacity, allergy, Wedding Day, incident, document and provider state. Weather remains planned without a separate provider contract.

`ContingencyPlan` has mutable draft metadata and immutable approved versions. Triggers only recommend activation in Slice 9. Simulation is read-only and records inputs, impacted resources, warnings and proposed actions. Activation requires capability, approved version, preview, `If-Match`, `Idempotency-Key` and explicit approval. Actions use the closed canonical command registry; financial, commercial-agreement, destructive and publication actions remain prohibited.

## Consequences

- Scores are explainable and cannot be invented by AI.
- Risk detection never silently creates canonical risks.
- Plan B history survives later edits.
- Simulation cannot mutate wedding state and activation effects are auditable.
