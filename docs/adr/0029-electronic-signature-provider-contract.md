# ADR 0029: Electronic signature provider contract

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

Slice 5 has an auditable WeddingOS acknowledgement, not an external electronic signature. Slice 6 needs a provider-neutral envelope flow without claiming universal legal validity or moving a signature to a different contract version.

## Decision

`ElectronicSignatureProvider` owns provider operations: create/get/cancel envelope, signer-scoped signing link, verified webhook and evidence download. `FakeElectronicSignatureProvider` is deterministic local test infrastructure and reports `TEST`. `ConfiguredElectronicSignatureProvider` is an adapter boundary selected by environment; external mode refuses startup when its endpoint/secret contract is incomplete.

Every envelope is bound to one immutable `VendorContractVersion`, one materialized `DocumentVersion` and both content hashes. Wedding and vendor signers are derived from authenticated memberships/contract parties. The creator cannot sign for another user. Editing the contract invalidates a nonterminal stale envelope; a completed envelope never moves to a newer version.

Provider events are signature-verified from the raw body, timestamp-bounded, deduplicated by provider event ID and mapped through a closed event table. Provider workspace/vendor claims are ignored; tenant context is loaded by provider envelope ID and persisted contract relationships. Status transitions are monotone. Completion requires every required signer, matching document evidence and provider confirmation.

The UI distinguishes operational acknowledgement from `TEST`, `STANDARD`, `ADVANCED` and `QUALIFIED`. `QUALIFIED` is displayed only when the configured provider and persisted evidence explicitly attest it; WeddingOS does not provide legal advice or universal-validity claims.

## Consequences

- Local signing proves workflow/evidence behavior only.
- Duplicate and out-of-order webhooks are safe, retained and non-regressive.
- External provider outage never fabricates a completed contract state.
