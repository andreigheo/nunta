# WeddingOS Slice 5 final handoff

Date: 2026-07-19  
Scope: Marketplace, Vendor OS, RFQ, offers, negotiation, bookings, structured contracts, budget, expenses and manual external payments  
Visual direction: preserved; the existing layout, typography, semantic colors, spacing, responsiveness, themes and shared UI primitives remain unchanged

## Outcome

Slice 5 replaces the production mock/local-success paths for the commercial flow with persistent, versioned and tenant-isolated data. A published vendor can be found in Marketplace, receive an RFQ, submit immutable offer versions, negotiate and produce a booking plus a structured contract. The wedding workspace can plan a budget, record expenses, create payment schedules and record or reverse payments that occurred outside WeddingOS. Dashboard, Calendar, Search, Notifications and Activity consume real commercial projections. Demo mode remains local and sends zero API mutations.

WeddingOS does not process cards, hold money, issue payouts or claim qualified electronic signatures. Contract acknowledgement is an explicit operational confirmation with a persistent disclaimer; payments are external evidence recorded manually.

## Marketplace

- Public discovery returns only explicitly published vendor profiles and their active public services, packages, regions, availability and portfolio references.
- Search, category, service region, date availability, verification and price filters run server-side; rating/review claims are not invented.
- Workspace favorites and shortlists are persistent, idempotent and workspace-isolated.
- Public serializers redact legal, membership, invitation and internal operational fields.
- `/marketplace`, `/marketplace/[id]`, `/favorites` and `/shortlists` use the real API. Empty, loading, error and planned review states are honest.

## Vendor OS

- Vendor organizations have an independent tenant boundary, role templates, memberships, capability overrides and invitations.
- Invitation tokens are random, hash-only at rest, e-mail-bound, expiring and invalidated on accept/decline/revoke/resend. Preview and failures expose only neutral, minimal information; `/vendor-invitation` is a real API-backed route.
- Vendor Owner, Manager, Sales, Operations and Viewer receive distinct atomic defaults; last-owner and inactive-member rules are enforced by the API and database.
- Profile, services, packages, service regions, availability and portfolio references are persistent. Publication and unpublication are explicit transitions.
- RFQ inbox, offers, negotiations, bookings and contracts use side-specific serializers and the selected persisted vendor organization context.
- `/vendor`, `/vendor/profile`, `/vendor/services`, `/vendor/requests`, `/vendor/offers`, `/vendor/bookings` and `/vendor/contracts` are real API-backed routes. The common Vendor OS layout includes the required `Suspense` boundary for query-driven organization selection.

## Procurement, offers and negotiation

- RFQs persist requirements, questions, selected recipients and immutable recipient snapshots. Sending is explicit and idempotent.
- Each recipient is independently delivered through a durable `rfq_delivery` consumer execution; vendor response state is projected through a verified relationship helper.
- Offer totals are calculated server-side from integer minor-unit line items, discount and tax. Submitted versions are immutable.
- A vendor can create, revise, submit or withdraw an offer. The wedding side can compare, review, request a revision, reject or accept according to the state machine.
- Negotiation uses a shared thread with sender identity derived from the authenticated wedding or vendor tenant.
- Accepting an offer is atomic and idempotent: competing offers transition consistently, and the booking, structured contract, budget item, expense and initial payment schedule projections are not duplicated on replay.
- `SINGLE_AWARD` acceptance uses an RFQ-scoped transaction lock and database winner constraint. A real two-vendor concurrent test produces one 201 winner and one typed `RFQ_ALREADY_AWARDED` conflict.
- Availability is never inferred from missing data: public state remains `UNKNOWN` without an explicit covering `AVAILABLE` block, and acceptance revalidates availability inside the serialized transaction.

## Bookings and contracts

- Bookings persist accepted commercial snapshots, service items, milestones, dates, status and version.
- Booking transitions are explicit; arbitrary status patching is not exposed.
- Contracts persist immutable content-hashed versions, shared review state and per-party acknowledgements. The SHA-256 hash covers the document, party snapshots, summary, service scope, payment terms and cancellation terms.
- Wedding and vendor acknowledgements derive the acting party from authorization context and require optimistic concurrency.
- A vendor acknowledgement cannot read the private wedding budget. The bounded `weddingos_apply_effective_contract_projection` database contract revalidates both persisted parties and acknowledgements, then applies only the linked booking/budget/schedule/availability effects.
- The UI states clearly that acknowledgement is a WeddingOS operational confirmation, not a qualified electronic signature.
- Contract and commercial exports use managed `GeneratedArtifact` records and secure artifact download contracts; large payloads are not stored in job JSON or unmanaged temporary files.

## Budget, expenses and payments

- One canonical `BudgetPlan` per workspace owns versioned categories and items. All amounts are safe integers in workspace currency minor units.
- Budget summary, committed, estimated, spent, paid, scheduled and outstanding totals are calculated on the server. Reversed/cancelled records are excluded according to ADR 0025.
- Expenses and payment schedules are persistent and can reference the canonical vendor booking or budget item without inventing payment-processor data.
- A payment record represents evidence of an external payment. Confirmed originals remain immutable; full reversals and partial refunds are positive append-only compensating ledger entries whose aggregate cannot exceed the original. WeddingOS never claims that it moved or refunded money.
- Payment reminders use durable `available_at` scheduling and revalidate the persisted schedule version, status, tenant and recipient access before delivery.
- `/budget` and `/payments` use canonical records and manual-payment wording. Quick Create exposes real expense, external payment, vendor search and RFQ actions only.

## Cross-tenant security

- Wedding-owned records require `app.current_workspace_id` plus an active membership.
- Vendor-owned records require `app.current_vendor_organization_id` plus an active vendor membership.
- Shared commercial records persist both tenant IDs and expose side-specific authorized views; a request cannot supply both contexts arbitrarily.
- Worker workspace/vendor context is derived from persisted outbox, execution and aggregate relationships. BullMQ tenant payload is not authoritative.
- Forced RLS is enabled for every tenant-scoped Slice 5 table. Runtime API and worker use restricted `weddingos_app` and `weddingos_worker` roles, never the database owner.
- Wedding, vendor and forged cross-tenant access tests pass. Public Marketplace and Search serializers do not leak private fields.

## Database and migrations

Slice 5 adds 38 canonical entities:

`VendorOrganization`, `VendorRoleTemplate`, `VendorOrganizationMembership`, `VendorMembershipCapabilityOverride`, `VendorOrganizationInvitation`, `VendorProfile`, `VendorService`, `VendorPackage`, `VendorServiceRegion`, `VendorAvailabilityBlock`, `VendorPortfolioReference`, `VendorFavorite`, `VendorShortlist`, `VendorShortlistItem`, `RequestForQuote`, `RfqRequirement`, `RfqQuestion`, `RfqRecipient`, `RfqRecipientSnapshot`, `VendorOffer`, `VendorOfferVersion`, `VendorOfferLineItem`, `VendorOfferAnswer`, `NegotiationThread`, `NegotiationMessage`, `VendorBooking`, `BookingServiceItem`, `BookingMilestone`, `VendorContract`, `VendorContractVersion`, `ContractPartyAcknowledgement`, `BudgetPlan`, `BudgetCategory`, `BudgetItem`, `ExpenseRecord`, `PaymentScheduleEntry`, `PaymentRecord` and `VendorNotification`.

Applied Slice 5 migrations:

1. `20260719130000_slice_5_vendor_tenant_and_marketplace`
2. `20260719133000_slice_5_procurement_and_contracts`
3. `20260719140000_slice_5_budget_and_payments`
4. `20260719143000_slice_5_dual_tenant_rls_and_worker_context`
5. `20260719150000_slice_5_capabilities_and_projection_hardening`
6. `20260719153000_slice_5_vendor_bootstrap_returning`
7. `20260719154000_slice_5_vendor_rfq_response_projection`
8. `20260719220000_slice_5_commercial_financial_hardening`
9. `20260719223000_slice_5_worker_aggregate_context`
10. `20260719224500_fix_worker_aggregate_id_contract`
11. `20260719230000_fix_vendor_invitation_acceptance`
12. `20260719231500_fix_vendor_invitation_membership_upsert`
13. `20260719232500_fix_vendor_invitation_token_invalidation`
14. `20260719233500_public_vendor_active_lookup`
15. `20260719234500_offer_acceptance_party_lookup`
16. `20260719235500_offer_acceptance_availability_lookup`
17. `20260720000500_fix_commercial_upsert_constraints`
18. `20260720001500_secure_contract_financial_projection`
19. `20260720002500_version_payment_schedules_by_contract`

The live database reports 50/50 repository migrations applied and zero pending, with forced RLS and the expected constraints/indexes. Corrective migrations were added instead of rewriting already-applied history. The post-gate database has 1,916 completed durable consumer executions. One intentional `DEAD_LETTER` created by the mandatory forged-context test remains as fail-closed recovery evidence; it is tied to an isolated E2E aggregate, not to either local test tenant.

## Events, consumers and jobs

- Versioned event families are `vendor.*.v1`, `marketplace.*.v1`, `rfq.*.v1`, `offer.*.v1`, `booking.*.v1`, `contract.*.v1`, `budget.*.v1`, `expense.*.v1` and `payment.*.v1`.
- Closed Slice 5 consumers are `rfq_delivery`, `offer_projection`, `booking_projection`, `contract_projection`, `contract_export`, `budget_projection`, `payment_projection`, `payment_reminder`, `commercial_export` and `vendor_notification_projection`.
- Reused consumers are `email`, `notification_projection`, `activity_projection` and `event_ack`.
- Every event/consumer pair has its own durable `OutboxConsumerExecution`; the deterministic BullMQ identity is derived from outbox message ID plus consumer name.
- Only contract and commercial exports create user-visible jobs. RFQ delivery, notifications, reminders and projections remain internal executions.
- Delivery is at-least-once with idempotent effects where supported; no universal exactly-once guarantee is claimed for external providers.
- Projection events do not recursively re-emit their triggering semantic event, and Activity uses semantic source dedupe.

## Frontend

- Real wedding routes: Marketplace/profile, Favorites, Shortlists, Requests, Offers, Bookings, Contracts, Budget and Payments.
- Real vendor routes: dashboard, Profile, Services, RFQ Requests, Offers, Bookings and Contracts.
- Overview contains real vendor/booking/contract/budget/payment metrics and a rule-based commercial next action.
- Calendar projects booking services, contract milestones and payment due dates without duplicating the canonical records.
- Global Search and Command Palette return only active authorized commercial resources.
- Quick Create enables only operations backed by real Slice 5 mutations; processor checkout, qualified e-signature, fabricated reviews, AI selection and fake exports remain disabled/planned.
- Production data has no mock fallback. Demo data remains isolated and produces zero real mutations.

## OpenAPI and registries

- 109 active Slice 5 operations (311 total active API operations) are documented with named request/response schemas, Problem Details, cookie auth, atomic capabilities, `If-Match`, `Idempotency-Key`, success/error codes and bounded list contracts where applicable.
- All active commercial mutations have concrete request bodies, all operations have a documented success response and zero planned operations are exposed as active.
- Swagger Parser validation passes in all four OpenAPI contract tests.
- `API_OPERATION_REGISTRY.json`, `FRONTEND_INVENTORY.json`, `BACKEND_ENTITY_CATALOG.json`, `AUTOMATION_REGISTRY.json` and `PERMISSION_MATRIX.csv` are reconciled to implemented behavior.

## Validation evidence

- Format: passed.
- Lint: passed with zero warnings.
- Typecheck: passed across frontend, API, worker and packages.
- Unit: 64 passed, 0 failed, 0 skipped (7 frontend + 39 API + 18 worker); Slice 5 domain subset 5/5.
- Integration: 32 passed, 0 failed, 0 skipped (17 Slice 1 + 3 Slice 2B + 6 Slice 3/4 + 6 Slice 5).
- E2E: 85 passed, 0 failed, 0 skipped (7 Slice 1 + 12 Slice 2B + 19 Slice 3 + 22 Slice 4 + 25 Slice 5), production Webpack server, Chromium, retries 0.
- API build: passed.
- Worker build: passed.
- Frontend build: passed; 59/59 pages generated with Next.js 16.2.10 Webpack.
- Route smoke: 57/57 user routes passed against `http://127.0.0.1:43191`, including `/vendor-invitation` and all Vendor OS routes.
- OpenAPI validation: 4/4 passed with Swagger Parser; 109 active Slice 5 operations and zero planned operations exposed.
- Database: 50/50 migrations applied and zero pending. The single synthetic dead letter is the persisted outcome of the mandatory forged-worker isolation test.
- Persistent runtime: PostgreSQL, Redis, Mailpit, API, worker and web are healthy. API/worker/web are enabled and active.
- Auth: all 10 local role accounts were restored idempotently after destructive test fixtures. Representative Couple Owner and Vendor Owner sign-in plus tenant reads returned HTTP 200. Credentials are documented in `docs/LOCAL_TEST_ACCOUNTS.md`.
- Authenticated visual smoke: Couple Owner Marketplace and Vendor Owner dashboard rendered from the persistent production server with real API data and zero build/application errors.
- Restart recovery: after controlled `SIGTERM`, API PID `1681074 -> 1682574`, worker PID `1681072 -> 1682576`, web PID `1681075 -> 1682575`. All enabled `Restart=always` services recovered automatically; `/ready`, `/sign-in` and `/vendor-invitation` returned 200 with database/Redis connected, worker healthy and outbox dispatching.

## Limitations

### EXPECTED FOR NEXT SLICE

- Qualified electronic signature, arbitrary document upload/storage and external contract-signing providers.
- Online card processing, escrow, payouts, commissions, refunds through a processor and accounting/bank synchronization.
- Verified reviews/ratings, vendor subscription billing and platform marketplace monetization.
- General Copilot/AI vendor recommendations, autonomous procurement and financial forecasting.

### TECHNICAL DEBT

- `CommercialService` is intentionally one cohesive Slice 5 transaction boundary; split it by vendor, procurement, contract and finance domain before materially expanding those areas.
- Marketplace filtering uses the current PostgreSQL query model. Add dedicated geospatial/full-text infrastructure only when measured volume requires it.
- On the Windows-mounted source checkout, E2E builds and serves an isolated production `.next-e2e` artifact; this avoids the Next React Refresh/CommonJS workspace conflict and keeps production `.next` independent.
- Local integration/E2E gates must isolate the persistent worker while their own worker is active because both intentionally share PostgreSQL/Redis; otherwise either worker may win an export job while using a different test artifact root. The gate wrapper stops and automatically restarts only API/worker for that interval.
- Mailpit is the expected local provider. A production email/provider configuration and operational alerting must be supplied at deployment time.

### BLOCKER

- None.

## Verdict

**READY FOR SLICE 6**

Slice 6 was not started.
