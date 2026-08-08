# WeddingOS Slice 3 final handoff

Date: 2026-07-19  
Scope: Guest CRM, digital invitations, Guest Companion, RSVP, menus and protected allergy workflows  
Visual direction: preserved; only functional/loading/empty/error/conflict/job/planned states changed

## Outcome

Slice 3 replaces the production mock/local-state paths for `/guests`, `/invitations`, `/invitations/editor`, `/rsvp`, `/menus` and `/guest` with persistent, tenant-isolated domain operations. Overview, search, calendar projections and Quick Create now use the implemented guest domain. Demo mode remains isolated from the real API.

## Guest CRM

- Households and guests use canonical IDs, CRUD/archive operations, `If-Match`, idempotent creates and forced RLS.
- Child and plus-one are explicit Guest flags; one plus-one per primary guest is enforced.
- Contact fields are normalized; PII and private/sensitive fields are capability-redacted and sensitive values are encrypted at rest.
- Guest tags have real CRUD and assignments.
- The list supports server search, side/category/tag/invitation/RSVP/menu/allergy/logistics filters, stable sorting and cursor pagination.
- Multi-select bulk actions persist tag changes, household moves, archive, invitation-recipient preparation, campaign audience additions and RSVP reminder sends.
- CSV/XLSX import uses managed storage, background parsing, a full-screen mapping/review wizard, duplicate preview, row decisions and idempotent commit. Custom column mappings reparse the managed source and rebuild normalized rows; unknown raw values are never persisted in preview data.
- Guest export uses `GeneratedArtifact`; large payloads are not stored in job JSON or unmanaged temporary files.

## Digital invitations and access

- `InvitationSite` owns immutable `InvitationVersion` records, structured documents/settings, safe URL validation and explicit publish/unpublish.
- Recipient preparation is idempotent across retries and independent batches.
- `GuestAccessGrant` stores only token hashes and supports expiry/revocation. Guest auth is separate from organizer sessions.
- Guest Companion resolves one persisted invitation recipient/household; forged, revoked, expired and cross-household grants are rejected.
- QR generation rotates a scoped opaque grant and returns real SVG/PNG content.

## Campaign delivery

- E-mail is the only active channel. WhatsApp, SMS and push remain planned/disabled.
- Audience filters are typed and applied both in preview and in the immutable pre-send snapshot; guest/household/tag/side/category/invitation/RSVP/child/plus-one criteria are supported.
- Sending uses `campaign_fanout`, per-recipient `campaign_delivery` and `campaign_summary` executions. Internal deliveries do not create a user-visible job per recipient.
- Each delivery has durable `DeliveryAttempt`, deterministic consumer job identity and dedupe.
- Provider webhook ingestion requires a valid signature, deduplicates provider event IDs, normalizes Message-ID values and preserves monotonic terminal delivery state.
- Partial failure and retry operate only on failed recipients. Campaign finalization is protected by an advisory lock.
- Delivery guarantee is at-least-once with idempotent effects where supported, not universal exactly-once delivery.

## RSVP and menus

- RSVP forms and submissions are versioned. Deadline changes can be repeated without outbox-key collisions.
- Guest RSVP is atomic per household, per guest and per wedding event; conflicts return the latest server version.
- RSVP supports child answers, a persisted plus-one, menu choice, allergies, accessibility/logistics fields and organizer override with audit reason.
- Declining removes stale active menu selections and related attendance-dependent state.
- Menus, courses, dietary tags and selections are canonical records; no menu JSON is embedded as fake data.
- Allergies are encrypted and only available through sensitive capabilities; `AllergyIssue` provides an explicit resolution workflow.
- Catering export is a protected generated artifact. Seating remains planned/disabled.

## Database and migrations

Slice 3 adds 27 tenant-scoped entities: `WeddingEvent`, `Household`, `Guest`, `GuestRelationship`, `GuestTag`, `GuestTagAssignment`, `GuestContactLog`, `GuestImport`, `GuestImportRow`, `InvitationSite`, `InvitationVersion`, `InvitationRecipient`, `GuestAccessGrant`, `Campaign`, `CampaignRecipient`, `ProviderWebhookEvent`, `RsvpFormDefinition`, `RsvpFormVersion`, `RsvpSubmission`, `GuestEventResponse`, `Menu`, `MenuCourse`, `DietaryTag`, `MenuDietaryTag`, `GuestMenuSelection`, `GuestAllergy` and `AllergyIssue`.

Applied migrations:

1. `20260718203757_slice_3_guest_core`
2. `20260718204055_slice_3_invitation_campaign`
3. `20260718204307_slice_3_rsvp_menu`
4. `20260718205000_slice_3_security_worker_capabilities`
5. `20260718210000_slice_3_provider_webhook_ingestion`
6. `20260718210500_slice_3_worker_derived_events`
7. `20260718211000_slice_3_wedding_event_backfill`
8. `20260718211500_slice_3_webhook_campaign_reconciliation`
9. `20260718212000_slice_3_guest_allergy_issue_policy`
10. `20260718212500_slice_3_worker_import_cleanup_grant`

There are 28/28 repository migrations applied. Forced RLS is enabled for every Slice 3 tenant table. API and worker use non-owner database roles and transaction-local persisted context.

## API, contracts and permissions

- 55 Slice 3 controller operations are active with concrete Zod/OpenAPI request and response schemas.
- Workspace operations advertise cookie auth and atomic capability requirements; Guest Companion advertises a separate opaque-token scheme.
- Versioned mutations use `If-Match`; retryable creates, bulk commands, sends and exports use `Idempotency-Key`.
- Guest lists use server filters/sorting/cursor contracts; campaign audience preview uses the exact same selection rules as send snapshot.
- Capabilities: `guest.*`, `invitation.*`, `campaign.*`, `rsvp.*` and `menu.*` follow the role defaults in `PERMISSION_MATRIX.csv` and are enforced on the server.
- The Viewer role now receives only redacted read capabilities for active Slice 3 domains.

## Events, consumers and projections

The implementation emits versioned `guest.*`, `invitation.*`, `campaign.*`, `rsvp.*`, `menu.*` and `allergy.*` events. Closed consumers are `email`, `notification_projection`, `activity_projection`, `guest_import`, `guest_export`, `campaign_fanout`, `campaign_delivery`, `campaign_summary`, `invitation_open_projection`, `rsvp_projection`, `rsvp_reminder` and `menu_export`.

Every event/consumer pair has its own durable `OutboxConsumerExecution`. BullMQ job IDs are deterministic over outbox message ID plus consumer name. Projection events do not recursively generate themselves; activity uses semantic-event source dedupe.

## Frontend

- `/guests`: filters, sorting, cursor paging, selection, tags, household editing, bulk actions, adult/child/plus-one creation, the Profile/RSVP/Events/Menu/Logistics/Communication/Notes/Activity drawer, import review and export are real.
- `/invitations` and `/invitations/editor`: version, preview, publish state, recipients, QR and campaign delivery are real.
- `/rsvp`: form/deadline, publish, submissions, override and reminder are real.
- `/menus`: menu CRUD, selection state, allergies and catering export are real.
- `/guest`: token-scoped household RSVP, plus-one, menu, allergy and logistics persist across refresh.
- `/overview`, search, Quick Create and wedding-event calendar projections use canonical Slice 3 data.
- Seating, external messaging, media upload, QR kit archive, PDF and general Copilot controls are disabled/planned.

## Validation evidence

Final repository gate:

- Format: passed.
- Lint: passed.
- Typecheck: passed across frontend, API, worker and packages.
- Unit: 51 passed, 0 failed, 0 skipped (7 frontend + 32 API + 12 worker; 14 Slice 3 domain tests included).
- Integration: 25 passed, 0 failed, 0 skipped (17 Slice 1 + 3 Slice 2B + 5 Slice 3).
- E2E: 38 passed, 0 failed, 0 skipped (7 Slice 1 + 12 Slice 2B + 19 Slice 3).
- API build: passed.
- Worker build: passed.
- Frontend build: passed; 52 routes generated.
- Route smoke: `/overview`, `/guests`, `/invitations`, `/rsvp` and `/menus` rendered from the persistent production runtime after a real owner login.
- OpenAPI validation: passed; concrete active operation/schema checks passed.
- Database: 28/28 migrations applied; Prisma reports the schema up to date.
- Runtime: PostgreSQL, Redis, Mailpit, API, worker and web are healthy. All three user services are enabled.
- Restart recovery: API PID `3833600 -> 3839314`, worker PID `3833601 -> 3839331`, web PID `3833602 -> 3839321`; each returned active with `NRestarts=1`, API readiness reported database/Redis/worker healthy and `/sign-in` returned 200.

## Limitations

### EXPECTED FOR NEXT SLICE

- Seating, table capacity and room allocation.
- Transport routes/capacity and accommodation allocation.
- Budget, vendors, marketplace, contracts, media/moments and general Copilot.
- WhatsApp, SMS, push and external invitation provider channels.

### TECHNICAL DEBT

- Provider adapter is SMTP-first; additional providers require their own signed webhook adapter and reconciliation tests.

### BLOCKER

- None for the implemented Slice 3 scope.

## Verdict

**READY FOR SLICE 4**. The repository gate, all browser scenarios and persistent-runtime proof are green. Do not start Slice 4 in this handoff.
