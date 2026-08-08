# WeddingOS Slice 5 implementation plan

Date: 2026-07-19  
Status: implementation and mandatory commercial/financial hardening gate complete  
Scope boundary: Marketplace, Vendor OS, RFQ, offers, negotiation, bookings, structured contracts, budget, expenses and manual external payments only

## Verified baseline

- `pnpm verify`: passed before Slice 5 (format, lint, typecheck, 58 unit, 26 integration, API/worker/frontend builds).
- Playwright: 60 passed, 0 failed, 0 skipped.
- Database: 31 migration directories and 31 applied migrations.
- Runtime: PostgreSQL, Redis, Mailpit, API, worker and web healthy; API/worker/web enabled and active.
- Workspace contract: canonical `currency=RON`; active workspaces use `Europe/Chisinau` or `Europe/Bucharest`.
- No payment processor and no existing vendor-organization tenant model.
- Existing visual system will be preserved; only functional/loading/empty/error/conflict/job/commercial-warning states change.

## Canonical models

Vendor tenant: `VendorOrganization`, `VendorOrganizationMembership`, `VendorRoleTemplate`, `VendorMembershipCapabilityOverride`, `VendorOrganizationInvitation`, `VendorProfile`, `VendorService`, `VendorPackage`, `VendorServiceRegion`, `VendorAvailabilityBlock`, `VendorPortfolioReference`.

Wedding procurement: `VendorFavorite`, `VendorShortlist`, `VendorShortlistItem`, `RequestForQuote`, `RfqRequirement`, `RfqQuestion`, `RfqRecipient`, `RfqRecipientSnapshot`.

Shared offer/relationship: `VendorOffer`, `VendorOfferVersion`, `VendorOfferLineItem`, `VendorOfferAnswer`, `NegotiationThread`, `NegotiationMessage`, `VendorBooking`, `BookingServiceItem`, `BookingMilestone`, `VendorContract`, `VendorContractVersion`, `ContractPartyAcknowledgement`.

Wedding finance: `BudgetPlan`, `BudgetCategory`, `BudgetItem`, `ExpenseRecord`, `PaymentScheduleEntry`, `PaymentRecord`. `BackgroundJob`, `GeneratedArtifact`, `OutboxMessage`, `OutboxConsumerExecution`, notifications and activity are reused.

## Tenant boundaries and RLS

- Vendor-owned rows require `app.current_vendor_organization_id` plus active vendor membership.
- Wedding-owned rows require `app.current_workspace_id` plus active workspace membership.
- Shared rows persist both party IDs and allow exactly one authenticated side at a time.
- Public marketplace selects only published profiles and related active public children.
- Forced RLS, non-owner roles, fail-closed missing context, field redaction and side-specific serializers are mandatory.
- Worker derives workspace/vendor context from persisted execution, outbox and aggregate relationships; forged payload context is rejected.

## Implemented migration sequence

1. `20260719130000_slice_5_vendor_tenant_and_marketplace`: vendor roles/membership/invitations, profile/services/packages/regions/availability/portfolio, publication constraints and indexes.
2. `20260719133000_slice_5_procurement_and_contracts`: favorites/shortlists, RFQ snapshots, offer versions/line items/answers, negotiation, booking snapshots/milestones, contract versions/acknowledgements.
3. `20260719140000_slice_5_budget_and_payments`: budget plan/categories/items, expenses, schedules, manual payments, source dedupe and money constraints.
4. `20260719143000_slice_5_dual_tenant_rls_and_worker_context`: vendor context helper, forced RLS/grants, cross-tenant policies, worker validation and derived-event allowlist.
5. `20260719150000_slice_5_capabilities_and_projection_hardening`: wedding capability defaults, vendor role templates, notification/activity dedupe and reminder/export support.
6. `20260719153000_slice_5_vendor_bootstrap_returning`: RLS-safe vendor tenant bootstrap.
7. `20260719154000_slice_5_vendor_rfq_response_projection`: persisted vendor RFQ response projection.

### Hardening migration and entity amendments

8. `20260719220000_slice_5_commercial_financial_hardening`: add `RfqAwardPolicy`, winning-offer source constraint, `FAILED` recipient delivery state, invitation lifecycle/generation fields, immutable booking/party snapshots, contract amendment lineage/effectivity, canonical budget chain/manual override fields, schedule source-version currency, append-only payment ledger entry type/currency/original link, source uniqueness, positive-money checks, confirmed-payment immutability trigger and booking-availability uniqueness.
9. `20260719223000_slice_5_worker_aggregate_context` and `20260719224500_fix_worker_aggregate_id_contract`: persisted aggregate verification plus the text/UUID aggregate-ID compatibility correction.
10. `20260719230000_fix_vendor_invitation_acceptance`, `20260719231500_fix_vendor_invitation_membership_upsert` and `20260719232500_fix_vendor_invitation_token_invalidation`: successive invitation lifecycle corrections; the final migration is canonical and removes the unavailable `pgcrypto` dependency from invalidation.
11. `20260719233500_public_vendor_active_lookup`: neutral public invitation lookup constrained to active organizations.
12. `20260719234500_offer_acceptance_party_lookup` and `20260719235500_offer_acceptance_availability_lookup`: narrow persisted-context resolvers used by serialized acceptance without widening RLS.
13. `20260720000500_fix_commercial_upsert_constraints`: non-partial unique indexes matching Prisma's optional unique selectors and PostgreSQL `ON CONFLICT` inference.
14. `20260720001500_secure_contract_financial_projection`: narrow, authorization-checked contract-to-finance projection; immutable content permits only effectivity lifecycle timestamps.
15. `20260720002500_version_payment_schedules_by_contract`: historical schedules are version-keyed while active manual schedule sequences remain uniquely constrained.

Existing entities are amended rather than duplicated: `RequestForQuote`, `RfqRecipient`, `VendorOrganizationInvitation`, `VendorBooking`, `BookingServiceItem`, `VendorContractVersion`, `BudgetItem`, `PaymentScheduleEntry`, `PaymentRecord` and `VendorAvailabilityBlock`. No Slice 6 entity is introduced.

## API surface

Public: marketplace vendor list/detail.

Vendor organization: organization list/create/get/update, members/invitations, profile get/update/publish/unpublish, service/package/availability CRUD, RFQ inbox/open/decline, offer create/draft/submit/withdraw, negotiation, booking/contract reads/transitions/acknowledgement.

Wedding marketplace/procurement: favorites, shortlist CRUD/items, RFQ CRUD/requirements/questions/recipients/preview/transitions, offer list/detail/comparison/review transitions, negotiation, booking list/detail/update/transitions, contract list/detail/draft/transitions/acknowledgement/export.

Finance: budget plan/summary, category/item CRUD, expense CRUD, payment schedule CRUD, payment CRUD/transitions, budget/payment/booking/comparison exports.

Existing calendar, dashboard, search, notifications, activity and job/artifact endpoints are extended rather than duplicated. Mutations use required `If-Match` and `Idempotency-Key`; lists use bounded cursor/filter/sort contracts.

Hardening adds vendor invitation inspect/accept/decline/resend/revoke operations, explicit contract amendment creation through the existing versioned contract surface, explicit payment adjustment input for reversal/refund amount, RFQ aggregate progress, and public availability state. These remain resource-oriented endpoints; no generic action endpoint is added.

## Events, consumers and jobs

Events follow the Slice 5 versioned catalog: `vendor.*`, `marketplace.*`, `rfq.*`, `offer.*`, `booking.*`, `contract.*`, `budget.*`, `expense.*` and `payment.*`. Projections never recursively emit their source event.

Closed consumers added: `rfq_delivery`, `offer_projection`, `booking_projection`, `contract_projection`, `contract_export`, `budget_projection`, `payment_projection`, `payment_reminder`, `commercial_export`, `vendor_notification_projection`. Existing `email`, `notification_projection`, `activity_projection` and `event_ack` are reused.

User-visible jobs exist only for contract/commercial exports. RFQ delivery, projections, reminders and vendor notifications are internal `OutboxConsumerExecution` rows. BullMQ job identity remains `<outboxMessageId>--<consumerName>` and delivery is at-least-once with idempotent effects where supported.

## Capabilities

Wedding capabilities: `marketplace.*`, `rfq.*`, `offer.*`, `booking.*`, `contract.*`, `budget.*`, `expense.*`, `payment.*` exactly as specified by Slice 5. Couple Owner/Partner receive all commercial capabilities. Planner receives operational commercial and financial read/write, while contract acknowledgement and payment confirmation remain owner/partner by default. Family/Viewer remain redacted read-only by explicit defaults/overrides.

Vendor capabilities: `vendor.organization.*`, `vendor.members.*`, `vendor.profile.*`, `vendor.services.*`, `vendor.availability.*`, `vendor.rfq.*`, `vendor.offer.*`, `vendor.booking.*`, `vendor.contract.*`. Vendor Owner has all; Manager has operations except last-owner changes; Sales has RFQ/offers/negotiation plus booking/contract read; Operations has booking/milestone and contract read; Viewer is read-only.

## Financial calculation contract

All API money values are integer minor units in workspace currency. Offer totals, category totals, budget summary, schedule/payment application and booking outstanding values are server-calculated with safe-integer checks. Cancelled/reversed/refunded records are explicitly excluded according to ADR 0025. Frontend never sends a trusted total.

The hardening gate changes the ledger implementation to append-only compensation: confirmed `PAYMENT` entries add, confirmed `REVERSAL`/`REFUND` entries subtract, and the original confirmed entry never changes. Operational-chain currency equality is enforced on every write and acceptance boundary with `CURRENCY_MISMATCH`. Budget projections follow one source chain with explicit manual overrides and no duplicate item per accepted commercial relationship.

## Frontend flows

- Preserve layout, sidebar, topbar, typography, palette, spacing, responsiveness and themes.
- Replace production mock imports on Marketplace/Favorites/Shortlists/Requests/Offers/Bookings/Contracts/Budget/Payments/Vendor OS with typed API data.
- Add Vendor OS organization switcher and the requested profile/services/requests/offers/bookings/contracts routes using existing primitives.
- Remove invented rating/review/verified claims and false exports/uploads/AI/payment/signature success.
- Add truthful empty/loading/error/conflict/job states, manual-payment wording, legal disclaimer and confirmation wording.
- Extend Calendar with commercial projections, Overview with real commercial metrics/next action, Search and Command Palette with authorized Slice 5 resources, and Quick Create with RFQ/budget item/expense/external payment.
- Demo remains local and produces zero API mutations.

## Test plan

Unit tests cover tenant membership/last owner, public redaction/publication, filters/dedupe, RFQ/offer/booking/contract state machines, immutable versions/content hash, checked money, optional lines/tax/discount, budget totals, schedules/payments/reversal/reminder staleness, capabilities and next-best-action.

Integration tests cover the 40 required real PostgreSQL/Redis/BullMQ/worker scenarios, including atomic accept/agreement/payment projections, replays, conflicts, both tenant RLS boundaries, competing-offer isolation and forged dual context.

Playwright adds all 25 required Slice 5 journeys. The Slice 5 integration suite contains six end-to-end domain journeys, including a real two-offer concurrent award and append-only partial-refund bounds. Final hard gate is followed by build, OpenAPI, route smoke, authenticated manual browser inspection, persistent service restart recovery and `/ready` proof.

### Mandatory hardening integration and E2E matrix

The final hardening gate additionally proves, with real PostgreSQL/Redis/BullMQ/worker where applicable:

1. currency mismatch fails atomically for offer, acceptance, schedule and payment;
2. concurrent `SINGLE_AWARD` acceptance creates exactly one winner and replay returns its chain;
3. source constraints reject duplicate booking, contract, booking item, budget chain, schedule source and booking availability;
4. contract amendment edit invalidates only draft acknowledgements, both parties acknowledge the same hash, and effective replacement changes only future unpaid schedules;
5. confirmed payment fields are immutable and partial refund/reversal compensation cannot exceed the original;
6. invitation token is hash-only, rotated on resend, expiry/revoke/decline are enforced, acceptance is e-mail bound, public failures are neutral and rate limited;
7. missing availability is `UNKNOWN`, filtering requires explicit `AVAILABLE`, acceptance revalidates, booking creates one `BOOKED` block and cancellation preserves manual blocks;
8. cross-tenant missing/forged/unrelated contexts and side serializers fail closed;
9. forged commercial worker workspace/vendor/aggregate/consumer transport claims fail closed;
10. RFQ progress distinguishes queued/sent/opened/responded/failed and API copy states durable intent rather than provider delivery;
11. acceptance preconditions are checked in one serialized transaction and any failure leaves zero downstream rows;
12. booking/contract snapshots remain unchanged after vendor/profile/service edits;
13. budget precedence updates one item, preserves explicit overrides, cancellation removes active commitment, and ledger totals use confirmed entries only;
14. public pagination/query/rate/date/filter/sort/slug/publication controls reject abuse and never expose unpublished or suspended profiles;
15. browser E2E covers mismatch, concurrent award, amendment, refund/reversal, invitation rotation/e-mail binding, unknown availability, cancellation preservation, truthful delivery progress and tenant isolation with zero skipped tests.

## Exact implementation order

1. Shared contracts: capabilities, DTOs, money functions, state machines and event/consumer allowlists.
2. Prisma schema and migrations in the order above; apply and prove forced RLS/non-owner access.
3. Vendor membership guard/context, organization/profile/service/package/availability APIs.
4. Public Marketplace, favorites and shortlists.
5. RFQ recipient snapshots/delivery and vendor inbox.
6. Offer calculation/versioning/comparison, negotiation and review transitions.
7. Atomic offer acceptance, booking and structured contract workflow.
8. Budget/categories/items/expenses/schedules/manual payments and atomic projections.
9. Worker consumers, reminders and managed exports.
10. Calendar/Overview/next-best-action/search/notifications/activity extensions.
11. Typed frontend client and production page connections without visual redesign.
12. OpenAPI, registries and documentation reconciliation.
13. Unit, integration and all 85 E2E; fix until zero failed/skipped.
14. Sync to persistent Linux runtime, migrate, restart-test, authenticated route/browser smoke and `SLICE_5_HANDOFF.md`.
