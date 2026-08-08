# WeddingOS Slice 9 implementation plan

Date: 2026-07-20  
Status: approved for implementation after baseline gate

## Baseline findings

- Slice 8 is canonical and the persistent API/worker/web runtime is healthy.
- Copilot drawer is disabled and contains mock messages/action cards; `/risks` uses seed data/local mutations; risk export and AI assessment are false-success controls; Quick Create risk is disabled.
- Existing provider, outbox, visible-job, generated-artifact, RLS, capability, demo isolation and fake-provider patterns are reusable.
- Document Vault already provides private object storage, scan state, immutable versions, grants and retention.
- PostgreSQL reports no available/installed `pgvector`; Slice 9 uses full-text/metadata/keyword retrieval.

## Provider interfaces and routing

- Add `CopilotProvider.generateStructuredResponse`, `generateRiskAssessment` and `generateProposal`.
- Implement deterministic and configured providers plus router/fallback.
- Route by task type, sensitivity, effective capability, tenant policy and provider availability. Provider/model remain server allowlists.
- Bounded context, timeout, one structured repair attempt, honest fallback and no chain-of-thought persistence.

## Context, retrieval and tool policy

- `CopilotContextBuilder` builds query-specific capability-filtered snapshots.
- `CopilotDataPolicy` redacts sensitive guest, payment, incident, credential, negotiation, moderation and document data.
- Retrieval covers active canonical domains with bounded source references and safe local deep links.
- Clean authorized PDF/DOCX/TXT versions may be extracted and chunked; content is untrusted data.
- Closed tools: READ, PROPOSE, EXECUTE_WITH_APPROVAL and PROHIBITED. Every execution target is re-authorized.

## Persistence and migrations

Planned migrations:

1. `20260720200000_slice_9_intelligence_core`: Copilot, document extraction, risks, contingency and automation entities/enums/indexes.
2. `20260720201000_slice_9_rls_capabilities_integrity`: foreign keys, checks, immutable-version triggers, forced RLS, least-privilege grants and role capabilities.
3. `20260720202000_slice_9_worker_context_recovery`: worker policies/helpers, scheduled execution indexes, dedupe/recovery constraints and deterministic templates.

Entities:

- Copilot: `CopilotConversation`, `CopilotMessage`, `CopilotRun`, `CopilotSourceReference`, `CopilotFeedback`, `CopilotProposal`, `CopilotProposalVersion`, `CopilotProposalAction`, `CopilotProposalApproval`, `CopilotProposalExecution`, `CopilotUsageRecord`.
- Retrieval: `DocumentTextExtraction`, `DocumentTextChunk`.
- Risks: `Risk`, `RiskSignal`, `RiskAssessment`, `RiskMitigationAction`, `RiskUpdate`.
- Plan B: `ContingencyPlan`, `ContingencyPlanVersion`, `ContingencyTrigger`, `ContingencyAction`, `ContingencyActivation`, `ContingencySimulation`.
- Automations: `AutomationRule`, `AutomationTrigger`, `AutomationCondition`, `AutomationAction`, `AutomationExecution`, `AutomationExecutionStep`, `AutomationTemplate`.

## API operations

- Conversations/messages/runs/feedback and proposal list/get/edit/approve/reject/execute.
- Risk list/create/get/edit/delete/transition/assessment and workspace detection.
- Contingency list/create/get/edit/approve/activate/complete/cancel/simulate.
- Automation list/create/get/edit/delete/activate/pause/test/dry-run, executions get/list/approve/reject and templates.
- Usage summary, intelligence Overview extension, Search extension and risk CSV export through `GeneratedArtifact` when requested.
- All retryable commands use `Idempotency-Key`; versioned mutations use `If-Match`; no generic arbitrary action route.

## Events, consumers and visible jobs

Versioned events follow the prompt catalog for `copilot.*`, `risk.*`, `contingency.*`, `automation.*` and `digest.*`.

Closed consumers: `copilot_run`, `copilot_proposal_execution`, `document_text_extraction`, `document_retrieval_index`, `risk_detection`, `risk_notification_projection`, `contingency_simulation`, `contingency_execution`, `automation_trigger`, `automation_execution`, `weekly_digest`, plus existing projections/ack.

Visible jobs are limited to long Copilot runs, workspace risk detection, simulation/activation, automation dry-run and weekly digest. Internal notification/activity work remains invisible.

## Approval policy and canonical commands

- LOW: confirmation; MEDIUM: explicit diff review; HIGH: explicit approval screen and revalidation; CRITICAL/PROHIBITED: non-executable.
- Allowed execution maps only to named handlers for task, calendar event, risk, contingency, draft announcement/campaign/RFQ/budget and payment reminder operations available in Slice 0–8.
- Offer acceptance, contract acknowledgement/signing, payments/refunds/payouts, settlement, destructive document actions, Wedding Day publication and critical incident resolution are prohibited.

## Automations and risk scoring

- Conditions use a bounded field/operator/value DSL; trigger/action enums are closed.
- Default approval is always required. Execution persists source-event chain, cooldown, depth and step dedupe.
- Permanent repeated failure pauses/disables the rule and notifies the owner.
- Risk matrix `risk-matrix.v1`: probability 1–5 × impact 1–5; LOW 1–4, MEDIUM 5–9, HIGH 10–16, CRITICAL 17–25.
- Detection produces reviewable signals/assessments; only explicit review creates/changes canonical risk.

## Capabilities and privacy

- Copilot: `copilot.read/use/create_proposal/approve_low_risk/approve_medium_risk/approve_high_risk/view_usage/configure_provider`.
- Risks/Plan B: `risk.read/write/assess/assign/accept/resolve/read_sensitive`, `contingency.read/write/approve/activate/complete`.
- Automations: `automation.read/write/activate/pause/approve/view_executions/manage_templates`.
- Owner/partner receive operational capabilities except provider config; planner receives use/propose/low-medium approval and operational risk/automation rights; family is read-only; viewer has none for Copilot/automation by default.
- Forced RLS applies to every workspace-owned entity; app/worker remain non-owner. Vendor scope is not broadened into wedding data.

## Frontend connection

- Replace mock Copilot drawer with persisted conversation/run/source/proposal states.
- Replace `/risks` seed/local state; add real risk detail and Plan B workflow.
- Add `/contingency-plans` and `/automations` using existing visual primitives.
- Extend Overview, Search, Quick Create and notifications without redesign.
- Attachments select only already-authorized Vault documents; voice/arbitrary upload remain disabled.

## Test plan

- Unit: routing/fallback/schema/redaction/retrieval/injection/tool allowlist/approval/stale execution/risk matrix/detection/Plan B/DSL/recursion/digest/capabilities/NBA.
- Integration with real PostgreSQL/Redis/BullMQ/MinIO/worker: all 44 requested families including RLS, forged contexts and restart recovery.
- E2E: retain 170 and add at least 25 Slice 9 journeys; final target at least 195 passed, zero failed/skipped/retries.
- OpenAPI schema/security/header/privacy gates; source/runtime build; route smoke; permanent systemd restart proof.

## Exact implementation order

1. Contracts, provider/policy/tool primitives and unit tests.
2. Prisma schema plus core/RLS/recovery migrations and capability defaults.
3. Copilot conversations, context/retrieval, run worker, source references and usage.
4. Proposals, approval preview, canonical command execution and stale checks.
5. Risk register, deterministic detection, assessments and mitigation.
6. Contingency versions, simulation, approval and activation execution.
7. Automation templates, DSL, dry-run, approval, execution, recursion/retry and digest.
8. Overview/Search/Notifications/Activity/OpenAPI/registries.
9. Copilot/Risks/Plan B/Automations frontend and Quick Create.
10. Unit, integration, minimum 195 E2E, builds, runtime deploy, route/browser smoke and restart recovery.

Slice 10 is explicitly excluded.
