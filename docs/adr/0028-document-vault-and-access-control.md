# ADR 0028: Document vault and access control

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

Wedding and vendor tenants share bookings and contracts but must not gain general access to each other's documents. Expense receipts and external-payment evidence are wedding-private by default, while a contract attachment can be explicitly shared with the persisted parties.

## Decision

`DocumentFolder`, `VaultDocument`, immutable `DocumentVersion`, `DocumentResourceLink`, `DocumentAccessGrant`, append-only `DocumentAccessEvent` and `DocumentRetentionPolicy` form the vault. A document has exactly one owning side: workspace or vendor organization. A resource link describes business context but does not itself grant access unless the link type has an explicit shared-party rule. Binary objects are reused by version/link identity and are never copied for each relationship.

Access requires all three layers: authenticated side plus atomic capability, verified persisted relationship/grant, and forced RLS. Wedding-private receipts/evidence are not visible to vendors. Contract/booking sharing requires an explicit grant to the counterparty or a `CONTRACT_PARTY`/`BOOKING_PARTY` grant. Vendor portfolio publication exposes only a clean derivative through a bounded public media endpoint; unpublish removes public access immediately.

Every metadata view, download, grant change, archive and delete request creates an append-only access event with actor, correlation ID and hashed network/client hints. Raw IPs, user agents, object keys and content are not placed in activity, search, notifications or logs.

Published or contract-used versions are immutable. Retention policy and legal hold can defer purge. API deletion means access revoked and cleanup queued, not provider deletion already completed.

## Consequences

- A shared commercial relationship is not a general tenant bridge.
- Grants are explicit, revocable, versioned by the document transaction and concurrency-protected.
- Search indexes metadata only in Slice 6 and applies the same authorization rules as direct reads.
