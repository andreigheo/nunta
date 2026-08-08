# WeddingOS Slice 3 implementation plan

Status: implemented; final gate recorded in `SLICE_3_HANDOFF.md`  
Baseline at implementation start: Slice 2B green; 19/19 existing E2E; 18/18 migrations; API, worker, web, PostgreSQL, Redis and Mailpit healthy.

## Audit result

`/guests`, `/invitations`, `/invitations/editor`, `/rsvp`, `/menus` and `/guest` use page-local seed objects and toast-only mutations. The seed reports 160 guests while containing 24 people; menu enums use both `copii` and `children`; invitation/guest RSVP deadlines conflict; invitation delivery and RSVP are conflated; recipient and assignee references use names rather than IDs; Guest Companion is hardcoded to one household. Seating, media upload, AI copy, WhatsApp/SMS and several exports claim or imply success without a backend. Slice 3 replaces only these behaviors while retaining the existing visual system.

## Models

1. Events/CRM: `WeddingEvent`, `Household`, `Guest`, `GuestRelationship`, `GuestTag`, `GuestTagAssignment`, `GuestContactLog`.
2. Import: `GuestImport`, `GuestImportRow` with managed file metadata, explicit duplicate decisions and row results.
3. Invitation/access: `InvitationSite`, immutable `InvitationVersion`, `InvitationRecipient`, `GuestAccessGrant`.
4. Campaigns: `Campaign`, `CampaignRecipient`, `ProviderWebhookEvent`; existing `DeliveryAttempt`, `BackgroundJob`, `OutboxMessage` and `OutboxConsumerExecution` are reused.
5. RSVP: `RsvpFormDefinition`, immutable `RsvpFormVersion`, `RsvpSubmission`, `GuestEventResponse`.
6. Menus/sensitive workflow: `Menu`, `MenuCourse`, `DietaryTag`, `MenuDietaryTag`, `GuestMenuSelection`, `GuestAllergy`, `AllergyIssue`.

## Migrations

1. `20260718203757_slice_3_guest_core`: enums and CRM/import/event tables, constraints and indexes.
2. `20260718204055_slice_3_invitation_campaign`: invitation/access/campaign tables and recipient dedupe.
3. `20260718204307_slice_3_rsvp_menu`: versioned RSVP/menu/allergy tables.
4. `20260718205000_slice_3_security_worker_capabilities`: forced RLS, token resolver and capabilities.
5. `20260718210000_slice_3_provider_webhook_ingestion`: signed provider-event ingestion and dedupe.
6. `20260718210500_slice_3_worker_derived_events`: safe worker-derived event contracts.
7. `20260718211000_slice_3_wedding_event_backfill`: onboarding-to-event materialization/backfill.
8. `20260718211500_slice_3_webhook_campaign_reconciliation`: terminal delivery/campaign reconciliation.
9. `20260718212000_slice_3_guest_allergy_issue_policy`: sensitive allergy policy hardening.
10. `20260718212500_slice_3_worker_import_cleanup_grant`: worker import and cleanup privileges.

All tenant tables use forced RLS. API policies require current workspace plus membership/capability; worker policies verify persisted job/outbox workspace; guest policies use the resolved access-grant ID. The application and worker roles remain non-owner roles.

## API operations

- CRM: household and guest list/create/get/update/archive; explicit guest bulk commands; import create/status/rows/mapping/row-decision/commit; guest export.
- Invitation: site read/draft/publish/unpublish/preview; recipient creation/list and individual QR SVG/PNG.
- Campaign: list/create/get/update/audience preview/transitions/recipients/statistics; signed email provider webhook.
- Guest public: bootstrap and RSVP read/submit using the separate guest access token security scheme.
- RSVP: form read/update/publish and organizer submission override.
- Menus: list/create/get/update/deactivate, selections read, allergy issues read/resolve, catering export.
- Existing calendar, dashboard and search responses gain WeddingEvent/guest-derived data without introducing generic aggregate/action endpoints.

Every write uses a concrete Zod DTO. Required mutations use `If-Match`, `Idempotency-Key`, or both as specified; list endpoints use server-side cursor/filter/sort contracts.

## Events, consumers and jobs

Versioned events are the closed list from the Slice 3 brief: `guest.*`, `invitation.*`, `campaign.*`, `rsvp.*`, `menu.*` and `allergy.*`. Projection events never recursively emit themselves.

Closed consumers: existing `email`, `notification_projection`, `activity_projection`, plus `guest_import`, `guest_export`, `campaign_fanout`, `campaign_delivery`, `campaign_summary`, `invitation_open_projection`, `rsvp_projection`, `rsvp_reminder` and `menu_export`.

User-visible jobs are guest import/export, campaign send and catering export. Internal projections/deliveries use durable consumer executions but no user-visible job per recipient. Every consumer job ID remains deterministic over outbox message ID and consumer name.

## Capabilities

- Guest: `guest.read`, `guest.read_pii`, `guest.write`, `guest.archive`, `guest.import`, `guest.export`, `guest.read_sensitive`.
- Invitation: `invitation.read`, `invitation.write`, `invitation.publish`, `invitation.manage_recipients`.
- Campaign: `campaign.read`, `campaign.write`, `campaign.send`, `campaign.view_delivery`.
- RSVP: `rsvp.read`, `rsvp.write`, `rsvp.override`, `rsvp.configure`.
- Menu: `menu.read`, `menu.write`, `menu.read_allergies`, `menu.resolve_allergies`, `menu.export`.

Owner and partner receive all. Planner receives the brief's operational set (not private guest notes unless overridden). Family collaborator receives redacted reads. Viewer receives redacted read-only access. Backend authorization and serializers enforce PII/allergy separation.

## Frontend flows

1. `/guests`: real query/filter/pagination, household/guest dialogs and drawer, import review, export job and explicit bulk actions.
2. `/invitations` and editor: real draft/version/status/preview/publish/recipient/campaign state; only e-mail enabled; individual QR real.
3. `/rsvp`: real form/deadline/version, metrics, recent submissions, reminder campaign and admin override.
4. `/menus`: real menus/courses/tags/selections/allergy issues/catering export; Seating visibly planned.
5. `/guest?token=...`: token-scoped bootstrap and atomic RSVP; no hardcoded household or internal data.
6. Overview/search/quick-create/calendar: guest read model, safe search results, real Add Guest/Add Household and WeddingEvent projections.

The current sidebar, top bar, theme, typography, palette, spacing, components and responsive behavior are retained. New UI is limited to loading, empty, error, conflict, job progress, sensitive-data warnings and truthful planned states.

## Test plan

- Unit: normalization, relationships, plus-one/child rules, derived invitation status, token/hash/revocation, immutable version validation, campaign state/progress, import mapping/dedupe/decisions, per-event RSVP/deadline, menu selection, sensitive redaction, summary/NBA, capabilities, webhook signature and safe map URLs.
- Integration: the 34 database/Redis/BullMQ/worker/Mailpit scenarios in the Slice 3 brief, including crash recovery, replay, partial delivery, signed webhook dedupe, concurrent RSVP, forced RLS and forged-workspace worker isolation.
- E2E: all 19 Slice 3 browser scenarios plus the existing 19, with zero failed and zero skipped.
- Contract/gates: OpenAPI parser and schema coverage, no planned routes exposed, format, lint, typecheck, unit, integration, API/worker/frontend builds, route smoke and persistent restart recovery.

## Exact implementation order

1. Add contracts, Prisma schema and the four migrations; deploy and prove forced RLS/capability defaults.
2. Implement CRM/events/import storage and household/guest/import/export API.
3. Implement invitation versions, recipients, token resolver, QR and public bootstrap.
4. Implement campaign snapshot/state machine, fan-out/delivery/summary consumers and signed webhook.
5. Implement versioned RSVP, atomic guest submit, organizer override, menus and protected allergy workflow.
6. Extend dashboard, calendar, search, notifications and activity projections.
7. Replace local frontend state in Guests, Invitations/editor, RSVP, Menus and Guest Companion; enable truthful Quick Create.
8. Update OpenAPI and all registries; add unit/integration/E2E coverage and `SLICE_3_HANDOFF.md`.
9. Run the complete gate, deploy the runtime mirror, restart persistent services and manually verify API/worker/web/database/Redis/Mailpit plus browser routes.

## Explicit exclusions

No Seating, route/room allocation, budget, vendor/marketplace, contracts, media/gallery/moments, general Copilot or Slice 4 work. WhatsApp/SMS/push, QR kit, media upload and PDF remain disabled/planned unless backed by a real implementation and test.
