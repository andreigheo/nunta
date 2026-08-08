# ADR 0045: Secure context and retrieval

- Status: accepted for Slice 9
- Date: 2026-07-20

## Context

WeddingOS data spans multiple sensitive domains. Copilot retrieval must not become a bulk tenant export, a cross-tenant bridge or a prompt-injection execution path.

## Decision

`CopilotContextBuilder` derives context only from authenticated session, persisted membership, effective capabilities, current local resource and query-specific canonical reads. Layers are explicitly separated as trusted system policy, tenant policy, capabilities, current resource, authorized canonical data, untrusted document excerpts and user request.

`CopilotDataPolicy` applies field allowlists and redaction before provider routing. Raw allergy/medical data, payment/provider identifiers, private incidents, credentials, tokens, private negotiations, moderation notes, raw document bytes and full guest contact lists are excluded from external context. Sensitive questions without capability return a refusal/redacted aggregate.

Retrieval uses domain-specific bounded queries plus PostgreSQL full-text/metadata filtering. `pgvector` is not available in the current PostgreSQL image and is not introduced. Deterministic keyword retrieval remains authoritative and testable.

Clean PDF, DOCX and TXT document versions may receive a bounded `DocumentTextExtraction` and protected `DocumentTextChunk` set. Extraction follows document retention and grants. Retrieved chunks are treated as untrusted data, never instructions; injection-like phrases are flagged and cannot affect tool authorization. Deep links are generated from an allowlist, never copied from model output.

## Consequences

- The provider receives the minimum necessary, source-attributed context.
- Authorization is rechecked after provider output and before execution.
- Document deletion/grant revocation removes retrieval access immediately.
- No vector infrastructure or embedding retention burden is introduced in Slice 9.
