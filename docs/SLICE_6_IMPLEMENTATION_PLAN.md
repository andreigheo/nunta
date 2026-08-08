# WeddingOS Slice 6 implementation plan

Date: 2026-07-20  
Status: accepted for implementation  
Scope: secure document vault, electronic-signature workflow and provider-hosted online payments; no Slice 7 work

## Verified pre-code baseline

- Source: format, lint and typecheck passed; 64/64 unit tests passed.
- Real integration gate: 32/32 passed with PostgreSQL, Redis, BullMQ and worker.
- Existing E2E: 85/85 passed in production Webpack/Chromium, retries 0.
- Build: API, worker and frontend passed; 59/59 pages generated.
- Database: 50 repository migration directories; live services reported the Slice 5 database ready before implementation.
- Runtime: PostgreSQL, Redis, Mailpit, API, worker and web healthy; API/worker/web enabled and active.
- Audit: no general object store, malware scanner, signature provider or online payment provider exists. `/documents` is mock/local success; receipt/payment-evidence/portfolio upload is absent; contract acknowledgement is operational only; `/payments` records external evidence only.
- Visual system is preserved. Only functional upload, scan, quarantine, signature, checkout, refund, error/conflict/job and disabled/planned states change.

## Provider interfaces and topology

- `ObjectStorageProvider`: signed upload, complete/head, bounded download, copy and delete. Implementations: MinIO development adapter and configured S3 adapter.
- `MalwareScanner`: clamd `INSTREAM`, bounded bytes/timeout and fail-closed sensitive purposes.
- `ElectronicSignatureProvider`: envelope, status, cancel, signer link, verified webhook and evidence. Implementations: fake local and configured external adapter.
- `OnlinePaymentProvider`: hosted checkout, expire, status, refund and verified webhook. Implementations: fake local and configured external adapter.
- Docker Compose adds private persistent MinIO on loopback plus a persistent healthy ClamAV daemon. `weddingos-private` has no anonymous/public policy.

## Models and migrations

1. `20260720090000_slice_6_secure_vault_signature_payments`: all canonical storage, vault, materialization, signature, checkout, transaction, refund, provider-event and reconciliation entities, enums, indexes and foreign keys.
2. `20260720093000_slice_6_rls_capabilities_and_integrity`: forced RLS/grants, shared-party resolvers, integrity checks, immutable-version protection and Slice 6 capability defaults.
3. `20260720094500_slice_6_signer_context_isolation`: persisted signer-side context and cross-party isolation.
4. `20260720100000_slice_6_access_and_idempotency_hardening`: access-event, grant and provider idempotency constraints.
5. `20260720101500_slice_6_portfolio_derivatives`: private `DocumentDerivative` identity and public-reference binding.
6. `20260720103000_slice_6_portfolio_worker_policy`: derivative worker writes constrained to the persisted execution context.
7. `20260720104000_slice_6_public_portfolio_policy`: public read restricted to published, clean derivatives and active vendor profiles.
8. `20260720105000_slice_6_contract_signer_candidates`: narrow persisted contract-party signer lookup.
9. `20260720106000_slice_6_payment_provider_event_update_policy`: provider inbox updates restricted to events related to the resolved checkout/transaction.

## API operations

- Upload/document: create/get/cancel upload, complete upload; document/folder list/create/get/update/archive/delete request; versions; grants/revoke; authorized signed download; access history; resource-scoped contract/expense/payment document lists.
- Signature: wedding create/list/get/send/cancel/signing-link; vendor get/signing-link; fake-provider sign/decline; verified provider webhook.
- Payment: create/get/expire checkout; transaction list/detail; refund create/list/detail; fake-provider hosted checkout completion/failure; verified provider webhook; internal reconciliation. Refund creation requires both `Idempotency-Key` and `If-Match`, reserves cumulative value under transaction lock and resumes an interrupted provider acknowledgement by refund ID.
- Existing Dashboard, Calendar and Search are extended; Quick Create activates upload, receipt, signature envelope and checkout only when supported.

## Events and consumers

Versioned events are the storage/document/signature/payment catalogs in the Slice 6 prompt. Closed consumers added: `document_scan`, `document_derivative`, `document_cleanup`, `document_retention`, `document_notification_projection`, `signature_envelope_create`, `signature_envelope_send`, `signature_status_projection`, `signature_evidence_download`, `payment_checkout_create`, `payment_status_projection`, `payment_refund`, `payment_reconciliation`. Existing `notification_projection`, `activity_projection` and `event_ack` are reused.

Every selected event/consumer has an independent `OutboxConsumerExecution`; BullMQ IDs remain `<outboxMessageId>--<consumerName>`. Jobs are user-visible only for genuinely progress-bearing scan/evidence/reconciliation/batch cleanup work. Delivery guarantee remains at least once with idempotent effects where supported.

## Capabilities

- Documents: `document.read/write/upload/download/share/delete/read_sensitive/manage_retention/view_access_log`.
- Signature: `signature.read/create/send/cancel/sign/download_evidence/configure_provider`.
- Online payment: `online_payment.read/create_checkout/expire_checkout/request_refund/read_provider_details/reconcile/configure_provider`.
- Couple Owner/Partner receive all non-platform-administration operations. Planner receives operational document/signature/payment read/create defaults, without sensitive/share/refund/provider configuration unless overridden. Vendor roles receive only vendor-owned/shared-document and contract-signer operations. Viewer/Family receive explicit, redacted read only where granted.

## Security and webhook contract

- Raw-body HMAC-SHA256 with timestamp tolerance, provider allowlist, payload limit, event-ID dedupe and rate limiting.
- No trust in workspace/vendor IDs from webhooks or BullMQ. Provider IDs and persisted aggregate relationships derive context.
- No PAN/CVV/payment authentication secrets, raw provider payloads, object keys, raw IPs or user agents in database responses/logs.
- Signed downloads are short-lived, clean-object-only and audited. Production rejects `encryption_state=NONE` for sensitive documents.
- Payment state mapping is monotone: `PENDING -> REQUIRES_ACTION/AUTHORIZED/CAPTURED/FAILED/CANCELLED`, then `PARTIALLY_REFUNDED/REFUNDED/DISPUTED` without regression. Signature mapping is likewise monotone to completed/declined/expired/cancelled.

## Frontend flows

- `/documents`: real folders, list/search/filter, upload progress, scan/quarantine, versions, grants, download, archive/delete request and access history.
- `/contracts` and `/vendor/contracts`: Contract/Versions/Attachments/Signature/Evidence/Activity using current layout and primitives; acknowledgement remains distinct.
- `/bookings`, `/budget`, `/payments`: explicit document attachment/evidence states; payments gain Upcoming/Checkouts/Provider payments/Manual/Refunds/Disputes/Evidence while preserving manual flow.
- `/vendor/profile`: clean portfolio upload/derivative/publish flow. Public marketplace never receives the private original URL.
- Overview, next-best-action, Calendar, Search and Quick Create use real authorized Slice 6 data. Demo remains local with zero API/provider mutations.

## Tests

- Unit: MIME/magic bytes, size/checksum/path safety, quarantine/access/grants/immutability/retention/materialization hashes, signature/payment state machines, event dedupe, refund bounds, reconciliation, capabilities and next action.
- Integration: all 44 prompt scenarios with PostgreSQL, Redis, BullMQ, MinIO, ClamAV, API, worker and Mailpit, including forged worker/provider context and restart recovery.
- E2E: preserve 85 and add the 20 mandatory Slice 6 scenarios; final gate minimum 105 passed, 0 failed, 0 skipped, 0 retries.
- OpenAPI: concrete schemas for all active operations, webhook security schemes, file limits, no planned active paths and Swagger Parser validation.

## Exact implementation order

1. Environment contracts, provider abstractions, shared DTOs/events/consumers and truthful feature flags.
2. Compose MinIO/ClamAV, storage/document schema and migrations, private bucket bootstrap.
3. Upload sessions, signed PUT, completion, worker scan/quarantine/derivative and signed download audit.
4. Vault folders/documents/versions/links/grants/access/retention/delete and resource conveniences.
5. Immutable contract materialization, signature entities/provider/webhook/state/evidence and contract projection.
6. Checkout/transaction/attempt/refund/provider-event/reconciliation and atomic append-only ledger projection.
7. RLS, capability defaults, cross-party resolvers and forged-context tests.
8. Frontend pages/client flows plus Overview/Calendar/Search/Notifications/Activity/Quick Create without redesign.
9. OpenAPI and all five registries; unit/integration/E2E until zero failed/skipped.
10. Sync source to persistent runtime, apply migrations, build, seed test accounts, manual authenticated/browser smoke, MinIO/ClamAV health and controlled restart recovery.
