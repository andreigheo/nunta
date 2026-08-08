# ADR 0049: AI privacy, usage and retention

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

Copilot conversations and document excerpts may contain private wedding data. Usage reporting must not become prompt logging or cross-tenant training material.

## Decision

Conversation retention is configured by `COPILOT_RETENTION_DAYS`; archive/delete states remove items from normal retrieval and scheduled cleanup may redact content after retention. Document chunks follow the document/grant/retention lifecycle. No private data is used for cross-tenant learning or model fine-tuning.

External provider use requires `COPILOT_ENABLED`, a configured provider/model and `COPILOT_EXTERNAL_DATA_ALLOWED=true`. Sensitive data policy can still force deterministic routing. Provider training/retention posture is server metadata and displayed honestly; WeddingOS does not claim behavior the provider contract cannot guarantee.

`CopilotUsageRecord` stores tenant/user/run/provider/model/task type, input/output units, optional estimated cost, currency, status and time. It never stores full prompts, source excerpts, secrets, system policy or hidden reasoning. Logs, outbox, activity and error fields are redacted and bounded.

Per-user/workspace limits, daily quota, provider concurrency, context bytes, excerpt count, proposal actions and timeouts are enforced server-side. Quota exhaustion limits Copilot only; canonical wedding data remains accessible.

## Consequences

- Usage can be measured without reconstructing private prompts.
- Provider enablement and retention are explicit deployment choices.
- Deletion/grant revocation and capability changes fail closed at retrieval and execution time.
