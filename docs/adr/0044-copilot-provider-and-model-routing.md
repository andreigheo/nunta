# ADR 0044: Copilot provider and model routing

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

WeddingOS needs useful intelligence even when no external AI provider is configured. Provider output cannot become authority, select arbitrary tools or receive an unbounded workspace dump.

## Decision

The domain uses `CopilotProvider`, implemented by `DeterministicCopilotProvider` and `ConfiguredCopilotProvider`. A server-side router selects provider/model from task type, sensitivity, workspace policy and provider availability. Requests cannot choose an arbitrary provider or model.

The deterministic provider is the availability and safety floor for question answering, summaries, prioritization, risk assessment, Plan B and proposal generation. The configured adapter has bounded timeout and one repair attempt for invalid structured output. Absence, failure or invalid output produces an honest deterministic fallback or a typed failure; it never produces false AI success.

Provider inputs and outputs are schema validated. The provider receives redacted, bounded context and a closed action vocabulary. Hidden reasoning, system prompts and full provider traces are neither requested nor persisted. Stored explanation is limited to answer, assumptions, warnings, sources, short basis and applied safety rules.

Environment controls provider, model, enablement, external-data permission, retention, context size and daily limits. Invalid or incomplete configuration fails closed. Usage records contain only units, cost estimate and routing metadata, not prompts.

## Consequences

- Product functionality remains available locally without a provider.
- External AI cannot widen data access or tool authority.
- Fallback and provider-disabled states are explicit in API and UI.
- Model routing and prompt versions are auditable and replaceable.
