# ADR 0032: Document and payment data retention

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

Contract evidence, receipts, signature certificates and provider payment records have different retention requirements. WeddingOS cannot claim universal legal or fiscal retention compliance.

## Decision

Retention is explicit metadata, not an immediate hard delete. Contract materializations and signature evidence remain while their contract/booking exists and can be placed on legal hold. Receipts and payment evidence use a configurable policy. Vendor portfolio unpublish revokes public access but preserves the private source until a separate purge.

A delete request archives the document, revokes grants and schedules `document_cleanup`. The object transitions to `DELETING`; only provider confirmation changes it to `DELETED`. Access/audit events, hashes, provider event identities, append-only financial entries and reconciliation results are retained after binary purge. Policies record retention days, legal hold, next review and purge timestamps and require `document.manage_retention` for changes.

Webhook payload bodies, card data and provider secrets are never retained. Provider metadata is allowlisted/redacted. Logs use identifiers, hashes and typed codes only.

## Consequences

- The product reports policy state and provider deletion truthfully.
- Jurisdiction-specific legal/fiscal policies remain deployment configuration and professional responsibility.
- Audit and financial history survive secure binary deletion.
