# ADR 0026: Commercial cross-tenant security

- Status: Accepted
- Date: 2026-07-19
- Slice: 5

## Context

Slice 5 creates the first records shared between two tenant types. Incorrect context derivation could leak a wedding budget to a vendor, competitor offers to another vendor or private vendor drafts to the marketplace.

## Decision

Authorization has three independent layers: session plus atomic capability, resource relationship validation, and forced PostgreSQL RLS. Wedding APIs use workspace path plus active workspace membership. Vendor APIs use organization path plus active vendor membership. Public marketplace APIs use a narrow published-profile policy and public-safe serializers.

Cross-tenant records carry both party IDs. A wedding-side request sets only workspace context; a vendor-side request sets only vendor context. The database policy admits a row when the active side matches one persisted party. The service then applies side-specific field redaction. The request cannot supply both contexts to broaden access.

Payment references, private notes, internal budget, contract draft internals, private vendor contacts and negotiation bodies are excluded from public DTOs, unauthorized search, notifications, activity, logs and redacted outbox payloads. Vendor-side booking and contract DTOs expose only explicitly shared schedule/contract facts and never internal budget allocation or private payment notes.

Worker queue payloads continue to contain only outbox/execution identity. Worker begin/reconcile functions join the persisted event to its wedding/vendor aggregate and derive the permitted side before transaction-local context is set. A queue-supplied workspace or organization ID is ignored. Missing, mismatched or forged party context is permanently rejected without a cross-tenant read/write.

Required isolation tests cover published/draft marketplace state, wedding-to-wedding isolation, vendor-to-vendor isolation, competing offers, negotiation, contract parties, wedding-only payments, missing context and forged dual-tenant worker context.

## Consequences

- A shared commercial relationship does not become a general bridge between tenants.
- 404/403 responses and redaction prevent resource enumeration.
- Runtime does not use a database owner or disable RLS.
- New shared fields require an explicit party-visibility decision before exposure.

## Mandatory authorization and recovery hardening amendment

Cross-tenant lookup is two-stage and non-enumerating. A narrow security-definer resolver returns only party identifiers for the supplied aggregate ID. The application verifies the authenticated wedding or vendor membership and required side capability, opens a new transaction, sets only the verified side context, and reloads the aggregate through forced RLS. Missing context, forged workspace/vendor IDs and unrelated party membership all fail closed with neutral responses.

For workers, `weddingos_begin_consumer_execution` must prove that the requested execution belongs to the supplied outbox and consumer. Commercial consumers then reload the aggregate identified by the persisted outbox, verify both persisted party identifiers and consumer contract, and derive transaction context from that proof. A payload aggregate ID is a claim to verify, never authority. Crash/retry semantics remain at-least-once with idempotent effects and durable per-consumer completion.

Isolation tests include missing context, forged workspace, forged vendor organization, unrelated membership, competing vendor offer reads, redacted vendor/wedding serializers, and forged transport payloads for each commercial worker consumer.

Contract agreement is the one command whose authorized second party can trigger wedding-private financial effects. The API does not switch the vendor into a workspace context and does not relax budget RLS. It invokes `weddingos_apply_effective_contract_projection`, a bounded security-definer function that revalidates the session actor, either active party membership, persisted contract/booking identity, current agreed version, both matching acknowledgements and operational currency. Only the linked budget chain, versioned schedules, booking and booking-derived availability block can change; no private wedding rows are returned to the vendor.
