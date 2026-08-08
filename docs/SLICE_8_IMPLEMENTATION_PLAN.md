# WeddingOS Slice 8 implementation plan

Status: Approved for execution  
Baseline: 2026-07-20

## Verified baseline

- `pnpm verify`: passed (103 unit, 35 integration, format/lint/typecheck/builds).
- Playwright: 139 passed, 0 failed, 0 skipped, 0 retries.
- Prisma: 67/67 migrations applied.
- API, worker and web: enabled and active under persistent systemd user services.
- PostgreSQL, Redis, Mailpit, MinIO and ClamAV: healthy; BullMQ/outbox/worker ready.
- Guest Companion resolves `GuestAccessGrant` and is token/household scoped.
- `/wedding-day` and `/moments` currently contain production seed/local-only success paths; `/guest` has real RSVP and published operational data but no Slice 8 live/check-in/media surface.

## Proposed durable model and migrations

Migration 68, `slice_8_wedding_day_core`: `WeddingDayPlan`, `WeddingDayPlanVersion`, `RunOfShowItem`, `RunOfShowDependency`, `RunOfShowItemAssignment`, `RunOfShowItemUpdate`, `WeddingDayChecklist`, `WeddingDayChecklistItem`, `WeddingDayContact`, `WeddingDayIncident`, `WeddingDayIncidentUpdate`, `WeddingDayIncidentAssignment`, `WeddingDayDecision`, `WeddingDayAnnouncement`, `WeddingDayAnnouncementAudience`, `WeddingDayAnnouncementDelivery`, `WeddingDayLiveEvent` plus enums, indexes, unique live-plan constraint and immutable-version trigger.

Migration 69, `slice_8_check_in_offline`: `GuestCheckInSession`, `GuestCheckInStation`, `GuestCheckInDevice`, `GuestCheckInCredential`, `GuestCheckIn`, `GuestCheckInEvent`, `CheckInManifestSnapshot`, `CheckInOfflineCommand`, `CheckInSyncBatch`; token/secret hashes only, one guest/event state, command dedupe and device/session constraints.

Migration 70, `slice_8_guest_moments_gallery`: `GuestMoment`, `GuestMomentMedia`, `GuestMomentReport`, `GuestMomentModerationCase`, `GalleryCollection`, `GalleryCollectionItem`; unique stored-object and gallery-item linkage; secure upload purpose extension.

Migration 71, `slice_8_rls_capabilities_and_integrity`: forced RLS and worker/grant policies for every tenant table, guest-safe SECURITY DEFINER lookups, capability templates and integrity triggers for cross-workspace/event/session references.

## State machines

- Plan: DRAFT -> READY -> PUBLISHED -> LIVE <-> PAUSED -> COMPLETED -> ARCHIVED.
- Run of Show: NOT_STARTED -> READY -> IN_PROGRESS; DELAYED/BLOCKED are explicit; terminal COMPLETED/SKIPPED/CANCELLED; REOPEN is authorized.
- Checklist: OPEN -> IN_PROGRESS/BLOCKED -> COMPLETED/SKIPPED.
- Incident: OPEN -> ACKNOWLEDGED -> INVESTIGATING -> MITIGATING -> RESOLVED -> CLOSED; CANCELLED is terminal.
- Announcement: DRAFT -> SCHEDULED/PUBLISHED -> EXPIRED/CANCELLED.
- Check-in session: DRAFT -> READY -> OPEN <-> PAUSED -> CLOSED -> ARCHIVED.
- Device: ACTIVE -> OFFLINE/REVOKED. Credential: ACTIVE -> USED/ROTATED/REVOKED/EXPIRED.
- Guest Moment: UPLOADING -> PROCESSING -> PENDING_REVIEW -> APPROVED -> PUBLISHED; REJECTED/HIDDEN/DELETED enforced by transitions.
- Gallery: DRAFT -> PUBLISHED -> ARCHIVED; unpublish returns to DRAFT.

## API surface

Implement the canonical routes from the Slice 8 brief for plans, run-of-show, order/dependencies, checklists, contacts, incidents/updates/decisions, announcements, check-in sessions/stations/devices/credentials/validation/check-in/out/attendance, offline manifest/sync, Guest Moments/moderation, galleries, organizer/guest SSE and the `wedding-day-command-center` read model. Organizer routes use cookie auth plus capability guard. Guest routes use opaque token/grant scope. Every active operation receives concrete Zod/OpenAPI request, response and problem contracts.

## Real-time, QR and offline contract

Every safe live mutation commits a replayable `WeddingDayLiveEvent`, then `wedding_day_live_projection` publishes its ID to a server-selected Redis channel. SSE re-reads authorized persisted events, supports `Last-Event-ID`, heartbeat/reconnect, limits and polling fallback. QR and device values are opaque random secrets stored hash-only and never logged/listed. Offline manifests are signed, event-scoped, expiring and minimal; sync is registered-device authenticated, bounded, UUID/sequence deduplicated and conflict explicit.

## Events and consumers

The versioned events listed in the Slice 8 brief are added to the closed event registry. Closed consumers are: `wedding_day_live_projection`, `wedding_day_reminder`, `incident_escalation`, `announcement_delivery`, `announcement_summary`, `check_in_projection`, `check_in_offline_sync`, `attendance_projection`, `guest_moment_scan`, `guest_moment_derivative`, `guest_moment_moderation_projection`, `gallery_projection`, plus the existing notification/activity/event acknowledgement consumers. Only manifest/sync/media batches/exports create user-visible `BackgroundJob` rows.

Delivery remains at-least-once with idempotent internal effects. Announcement publication means authoritative state and durable delivery intent committed, not that email was delivered.

## Capabilities and privacy

Add all brief capabilities under `wedding_day.*`, `incident.*`, `announcement.*`, `check_in.*`, `guest_moment.*` and `gallery.*`. Defaults follow ADR 0043. Medical/security incident detail, private contacts, guest presence, denial reasons, raw credentials/secrets, offline manifests, originals, moderation notes and storage keys are excluded from guest/public/search/activity/log contracts.

## Frontend connection

- Preserve `/wedding-day` layout, typography, spacing, theme and responsive shell; replace seed/local handlers with command-center data and versioned API mutations. Add real plan lifecycle, run-of-show, checklist, attendance/check-in, incident, announcement, contact and moderation states.
- Extend `/guest` with guest-safe live agenda/announcements, own QR/access/check-in state, Guest Moment upload/submissions and authorized gallery.
- Repurpose `/moments` as the real organizer Run of Show/media surface; remove false export/success behavior.
- Extend Overview, Search, Quick Create, Notifications and Activity with capability-filtered Slice 8 resources and safe summaries.
- Keep SMS/WhatsApp/native push, unrestricted public gallery, face recognition, adaptive video streaming and general Copilot visibly disabled/planned.

## Test plan

Unit coverage: state machines, immutable versions, cycles, delay, incident escalation, audience expiry, SSE authorization, token hashing/scope, eligibility/duplicates, offline dedupe/staleness, attendance, media validation/moderation/gallery, redaction, capabilities and next-best-action.

Integration coverage uses real PostgreSQL/Redis/BullMQ/MinIO/ClamAV for all 42 cases in the brief, including forced RLS, guest/device/worker isolation and restart recovery.

Add exactly the 25 mandatory Slice 8 Playwright scenarios with no skipped tests and preserve the 139-test regression suite, yielding at least 164 passed tests.

## Exact implementation order

1. Freeze audit evidence, ADRs and this plan.
2. Add contracts/capabilities/event and consumer allowlists.
3. Add append-only Prisma schema and migrations 68-71; apply and prove forced RLS/integrity.
4. Implement plan/run-of-show/checklist/contact/incident/announcement domain and state machines.
5. Implement replay ledger, Redis live projection, organizer/guest SSE and polling recovery.
6. Implement check-in sessions, hash-only credentials, validation, attendance, offline manifest/sync and race convergence.
7. Implement secure Guest Moment uploads, scan/derivative/moderation and gallery access.
8. Implement command-center/Overview/Search/Quick Create/notification/activity/export projections.
9. Connect `/wedding-day`, `/guest` and `/moments` without visual redesign; remove false-live/success paths.
10. Complete OpenAPI and reconcile all four JSON registries plus permission matrix.
11. Run format/lint/typecheck/unit/integration/OpenAPI/build, all 164+ E2E tests, route/browser/manual security smokes and restart recovery.
12. Write `SLICE_8_HANDOFF.md`, sync the validated source to the persistent runtime, restart services and manually prove health and test readiness.
