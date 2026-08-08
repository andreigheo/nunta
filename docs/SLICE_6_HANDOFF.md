# WeddingOS Slice 6 final handoff

Date: 2026-07-20  
Scope: secure document vault, electronic-signature workflow and provider-hosted online payments  
Verdict: **READY FOR SLICE 7**

## Storage

- `ObjectStorageProvider` keeps the domain independent from one vendor. Development uses the private S3-compatible MinIO adapter; configured production S3 uses the same contract.
- Docker Compose provisions the private `weddingos-private` bucket on loopback. Bucket names, object keys and storage credentials never appear in product DTOs.
- `FileUploadSession` closes each upload over tenant side, purpose, normalized file name, accepted media types, maximum bytes, checksum and expiry. Completion verifies object metadata before durable scan intent is committed.
- The worker detects media type from bytes, validates purpose/extension/checksum and scans through ClamAV `INSTREAM`. Sensitive files fail closed. Clean objects become `AVAILABLE`; infected or mismatched objects become `QUARANTINED` and cannot receive a download URL.
- Clean portfolio images produce a separate WebP `DocumentDerivative`. Only the published clean derivative can cross the public marketplace boundary; the original remains private.
- Retention, legal hold, archive and deletion are explicit states. Cleanup revokes access first, deletes through the provider and retains audit/hash metadata.

## Document Vault

- Canonical models: folders, documents, immutable versions, resource links, grants, access events, retention policies, stored objects and derivatives.
- Real APIs support list/search/filter, create/update, new version, retention, grant/revoke, access history, scan-gated download and retention-aware deletion.
- Contract attachments and immutable materializations are linked to persisted contract/version IDs and content hashes.
- Expense receipts and payment evidence remain wedding-private unless an explicit authorized rule grants access.
- Vendor portfolio publication uses the derivative identity and stops serving immediately after unpublish/suspension.

## Electronic Signature

- `ElectronicSignatureProvider` has deterministic fake and configured external adapters.
- An envelope is bound to one immutable contract version, materialized document version and matching content hashes.
- Signers are active persisted wedding/vendor memberships belonging to the contract parties; one user cannot obtain another signer's session.
- Provider events are raw-body HMAC verified, timestamp bounded, event-ID deduplicated, redacted and applied monotonically.
- Completion, decline, stale contract version, evidence download and unrelated-tenant isolation are implemented and tested.
- `TEST`, `STANDARD`, `ADVANCED` and `QUALIFIED` remain explicit levels. The fake adapter reports only `TEST`; WeddingOS does not claim universal legal validity.
- The Slice 5 operational acknowledgement remains a separate workflow and is never renamed as electronic signature.

## Online Payments

- `OnlinePaymentProvider` has fake hosted-checkout and configured external adapters. WeddingOS stores provider IDs and redacted method metadata, never PAN, CVV, track data or authentication secrets.
- The server derives amount, currency, schedule, budget item, booking, contract and vendor from canonical state. Checkout create is idempotent and expiry uses optimistic concurrency.
- Verified capture/failure/dispute events resolve tenant context by persisted provider identity. Capture creates one `PaymentRecord` with `sourceType=ONLINE_PAYMENT`; event replay creates no second financial effect.
- Refund requests require `Idempotency-Key` and `If-Match`, reserve cumulative value under an advisory lock and increment transaction version. Requests left `REQUESTED`/`PROCESSING` can resume safely with the same durable refund ID.
- Provider success creates one positive append-only `REFUND` record bound by `sourceType=ONLINE_REFUND` and `sourceId=refund.id`; debit semantics come from `entryType`. Partial, full, replay and over-refund behavior is tested.
- Schedule and budget paid totals are recalculated from the append-only ledger. The original capture is never rewritten or deleted.
- Reconciliation records bounded consistency checks; disputes remain explicit attention states and do not invent a chargeback entry.
- WeddingOS does not hold funds, provide escrow, promise payout/settlement or act as a fiscal invoicing system.

## Security

- Forced PostgreSQL RLS covers every Slice 6 tenant-scoped table. The application and worker use non-owner roles.
- Cross-party document access requires persisted contract/booking relationship plus an explicit grant/capability. Private receipts and originals do not leak to vendors or marketplace users.
- Signature sessions are signer-scoped; payment/refund reads and writes are workspace-scoped.
- Worker identity, tenant and aggregate context are reloaded from `OutboxConsumerExecution`/outbox state. Forged workspace/vendor/aggregate payloads fail closed.
- Provider webhooks use raw bytes, HMAC-SHA256, timestamp tolerance, event dedupe, closed type mapping and payload-size/rate limits. Workspace/vendor IDs from provider payloads are never authoritative.
- Logs, notifications, activity and APIs exclude object keys, raw file content, raw provider payloads, card data, secrets, raw IPs and full user agents.

## Database

- Live database: 59 migrations applied, 0 unfinished.
- Slice 6 migrations:
  - `20260720090000_slice_6_secure_vault_signature_payments`
  - `20260720093000_slice_6_rls_capabilities_and_integrity`
  - `20260720094500_slice_6_signer_context_isolation`
  - `20260720100000_slice_6_access_and_idempotency_hardening`
  - `20260720101500_slice_6_portfolio_derivatives`
  - `20260720103000_slice_6_portfolio_worker_policy`
  - `20260720104000_slice_6_public_portfolio_policy`
  - `20260720105000_slice_6_contract_signer_candidates`
  - `20260720106000_slice_6_payment_provider_event_update_policy`
- Canonical Slice 6 entity, index, constraint, RLS and migration mappings are reconciled in `BACKEND_ENTITY_CATALOG.json`.

## Frontend

- Connected pages: `/documents`, `/contracts`, `/payments`, `/vendor/profile`, `/marketplace/[id]`, `/overview`, `/calendar`, provider checkout and provider signature routes.
- Real states cover upload progress, verifying, clean, quarantine, error, grant, access history, signature timeline/evidence, checkout lifecycle, transaction failure and partial/full refund.
- The payments page preserves schedule/manual ledger state when the online provider projection is temporarily unavailable.
- Qualified signature, recurring payments, payouts, fiscal invoices, cloud-drive sync and provider-specific production administration remain disabled/planned.
- Existing layout, navigation, typography, spacing, colors, theme behavior, responsiveness and UI primitives were preserved.
- Demo mode remains local and produces zero real API, storage, provider or worker mutations.

## OpenAPI

- All 58 active secure-commerce controller operations have concrete request/response/problem schemas, cookie or public security, capabilities and examples through canonical `/api/v1` paths.
- Upload contracts document purpose, bytes, checksum, signed target and completion. Download contracts never expose object identity.
- Signature/payment webhooks document provider path, signature and timestamp headers.
- Versioned vault/signature/checkout/refund mutations document `If-Match`; retryable creates document `Idempotency-Key`.
- Swagger Parser validation passes. No planned Slice 7 operation is activated.

## Tests

| Gate                      |                            Passed | Failed | Skipped |
| ------------------------- | --------------------------------: | -----: | ------: |
| Format                    |                                 1 |      0 |       0 |
| Lint                      |                   repository gate |      0 |       0 |
| Typecheck                 |              7 workspace projects |      0 |       0 |
| Unit                      |     73 (web 7, API 48, worker 18) |      0 |       0 |
| Integration               |                                32 |      0 |       0 |
| E2E                       |                  105 (20 Slice 6) |      0 |       0 |
| API build                 |                                 1 |      0 |       0 |
| Worker build              |                                 1 |      0 |       0 |
| Frontend build            |                         59 routes |      0 |       0 |
| Route smoke               | API + protected/public web routes |      0 |       0 |
| OpenAPI validation        |                                 5 |      0 |       0 |
| Database migrations       |                                59 |      0 |       0 |
| MinIO health              |                                 1 |      0 |       0 |
| ClamAV health             |                                 1 |      0 |       0 |
| Provider fake integration |      signature + payment + refund |      0 |       0 |
| Persistent runtime        |                API + worker + web |      0 |       0 |
| Restart recovery          |                API + worker + web |      0 |       0 |

The 44-item Slice 6 integration checklist is covered across the 8 Slice 6 domain tests, 32 repository integration tests and 20 real-infrastructure Slice 6 E2E journeys. E2E uses PostgreSQL, Redis, BullMQ, MinIO, ClamAV, Mailpit, API, worker and production-built Next/Chromium.

One aggregate `pnpm verify` invocation reached the external 30-minute command limit during final Next static-page generation, after format, lint, typecheck, all unit/integration suites and the API/worker builds had passed. The production build was then rerun as its exact standalone gate and completed successfully with 59/59 routes; the full fresh E2E gate subsequently completed with 105/105 tests. The timeout was therefore an orchestration limit, not a failed product gate.

## Limitations

### EXPECTED FOR NEXT SLICE

- Production S3, electronic-signature and payment credentials, provider certification/webhook allowlists and jurisdiction-specific retention configuration are deployment concerns; local acceptance uses the deterministic fake providers.
- Payouts, invoices, tax documents, subscription billing, recurring payments, reviews and general Copilot remain outside Slice 6.

### TECHNICAL DEBT

- The historical four integration-spec files contain 32 named cases; the Slice 6 acceptance matrix is primarily represented by the 20 full-stack E2E journeys rather than 44 separately named integration cases.
- Next/Webpack builds on the Windows-mounted checkout are slow. The permanent runtime uses the WSL-native mirror and persistent services.
- Provider reconciliation is bounded to the adapter/status capabilities configured by a deployment; it does not claim universal settlement truth.

### BLOCKER

- None for Slice 7.

## Final verdict

**READY FOR SLICE 7**

Slice 7 was not started.
