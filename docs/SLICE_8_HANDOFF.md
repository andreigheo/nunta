# WeddingOS Slice 8 — Final Handoff

Date: 2026-07-20

## Scope and product outcome

Slice 8 implements the Wedding Day Command Center, live operational state, check-in and attendance, Guest Moments and curated galleries on the existing Slice 0–7 infrastructure. It does not start Slice 9 and it does not redesign the application.

## Wedding Day Plan

- `WeddingDayPlan` is the mutable lifecycle aggregate; `WeddingDayPlanVersion` is an immutable published/live snapshot.
- Explicit transitions cover publish, go-live, pause/resume and completion under `If-Match` and retry-safe command semantics.
- Run of Show items persist planned and actual times, critical/guest-visible flags, assignments, updates, ordering and acyclic dependencies.
- Item status changes use an explicit state machine; dependencies prevent invalid starts and actual timestamps are server-owned.
- Operational contacts are plan-scoped; phone and private notes are encrypted at rest and redacted without capability.
- Checklists and checklist items are persistent, assignable and transition through explicit operational states.

## Incidents and announcements

- Incidents persist type, severity, private details, assignment, updates, decisions, escalation and resolution lifecycle.
- Notifications, activity and guest/live payloads contain redacted summaries; private medical/security details do not enter logs or export rows.
- Announcements persist audience selectors and immutable audience/delivery snapshots at publication time.
- Delivery uses independently retryable outbox consumers and reports queued/delivery state without claiming provider success early.
- Guest Companion receives only announcements applicable to its persisted household grant.

## Real-time

- Organizer and guest streams use SSE backed by persisted `WeddingDayLiveEvent` sequence numbers and Redis notification.
- `Last-Event-ID` supports bounded replay after reconnect; the frontend shows connection state and falls back to canonical polling.
- Organizer and guest serializers are separate. Guest payloads exclude incidents, private contacts, other-household attendance and non-guest-visible run items.

## Check-in

- Persistent sessions, stations and registered devices use explicit status/version transitions.
- QR credentials contain opaque tokens without PII; credential tokens and device secrets are hash-only at rest and returned only at creation/rotation.
- Validation resolves the canonical session/event/guest relationship before any mutation.
- Online check-in/check-out is command-idempotent, records accepted/denied/duplicate outcomes and updates one canonical attendance record per event/guest.
- Manual override requires `check_in.override` plus a persisted reason; declined guests are otherwise denied.
- Offline manifests are bounded, session/device scoped and versioned. Sync validates device state, manifest version, sequence, credential proof and converges online/offline races without duplicate attendance.
- Device revocation invalidates outstanding manifests and prevents subsequent sync.

## Guest Moments and gallery

- Guest upload intent is household-grant scoped and creates a private, size/MIME/checksum-bounded upload session.
- Completion verifies object metadata; the worker re-verifies bytes, signature, checksum and size, then runs ClamAV fail-closed.
- Unsafe or mismatched media is quarantined. It cannot be approved or published.
- Clean images receive bounded private WebP derivatives; video uploads receive a bounded poster derivative through `ffmpeg`.
- Moderation, approval/rejection, publication, guest reports and moderation evidence are persistent and deduplicated.
- Galleries expose only approved/published derivatives authorized for the current guest grant; originals and storage keys remain private.

## Database

Migrations introduced for Slice 8:

- `20260720120000_slice_8_wedding_day_check_in_media`
- `20260720121000_slice_8_rls_capabilities_and_integrity`
- `20260720122000_slice_8_guest_media_preview_policy`
- `20260720123000_slice_8_guest_outbox_events`
- `20260720124000_slice_8_guest_report_self_policy`
- `20260720125000_slice_8_guest_moderation_case_insert`

The schema contains 33 new canonical Slice 8 models plus the reused `GeneratedArtifact`. Tenant-scoped models have forced RLS. Unique constraints protect plan versions, run dependencies, event/guest check-in, command IDs, device identity, media uploads, reports and gallery membership. Worker policies bind reads/writes to persisted outbox execution, job, actor and workspace context; no owner DB role is used at runtime.

## Async operations and exports

- Delivery remains at-least-once with idempotent effects where supported; it is not described as universal exactly-once delivery.
- Each event has durable per-consumer execution and a deterministic BullMQ job ID over outbox message ID plus consumer name.
- Internal projections remain separate from user-visible `BackgroundJob` records.
- Wedding Day exports use a user-visible job and an expiring owner-scoped `GeneratedArtifact`.
- Implemented exports: Run Sheet CSV/XLSX, contact sheet CSV/XLSX, check-in manifest CSV/XLSX, attendance CSV/XLSX and incident CSV/XLSX. Incident exports intentionally omit private descriptions and medical/security details.
- Gallery ZIP remains disabled because secure bounded archival is not part of this slice.

## Frontend

- `/wedding-day` uses the real command-center read model, Run of Show, transitions, checklists, attendance, incidents, media metrics, SSE state and operational exports.
- `/guest` uses the guest grant for live updates, own check-in credential and own media submissions.
- `/moments` uses real organizer moderation, preview and gallery data.
- `/overview` and global search include authorized Wedding Day canonical data.
- Quick Create is real for Run of Show item, checklist item, incident, announcement publication, manual check-in and gallery collection; entries are hidden without the required capability.
- Loading, empty, failure, reconnect, processing, quarantine and demo states are explicit. The existing layout, typography, tokens and responsive behavior were preserved.

## OpenAPI and registers

- Both organizer and guest routes have concrete request/response/Problem schemas, cookie or guest-token security, concurrency/idempotency headers and capability metadata.
- SSE and direct-upload contracts document replay and private-storage boundaries.
- `API_OPERATION_REGISTRY.json`, `FRONTEND_INVENTORY.json`, `BACKEND_ENTITY_CATALOG.json`, `AUTOMATION_REGISTRY.json` and `PERMISSION_MATRIX.csv` include the Slice 8 reconciliation.

## Verification

The final repository-wide gate and the dedicated Slice 8 evidence are:

- Slice 8 domain + OpenAPI: 25 passed, 0 failed, 0 skipped.
- Slice 8 E2E: 29 passed, 0 failed, 0 skipped, 0 retries.
- Export matrix: 5 artifact types generated and downloaded, including CSV and XLSX.

```text
Format: passed
Lint: passed
Typecheck: passed
Unit: 122 passed, 0 failed, 0 skipped (web 7, API 97, worker 18)
Integration: 35 passed, 0 failed, 0 skipped
E2E: 170 passed, 0 failed, 0 skipped, 0 retries (Slice 8: 29/29)
API build: passed in source and persistent runtime
Worker build: passed in source and persistent runtime
Frontend build: passed in source and persistent runtime; 65 routes generated
Route smoke: 63/63 passed against http://127.0.0.1:43191
OpenAPI validation: 7/7 passed
Database migrations: 73/73 applied in main and E2E databases; 0 active failures; 0 pending
PostgreSQL health: healthy
Redis health: healthy
Mailpit health: healthy
MinIO health: healthy
ClamAV health: healthy
SSE integration: passed
Offline check-in: passed
Persistent runtime: API, worker and web active and enabled under systemd
Restart recovery: passed for API, worker and web after forced process termination
Manual browser smoke: sign-in rendered WeddingOS and protected /wedding-day redirected safely
```

## Limitations

### EXPECTED FOR NEXT SLICE

- Secure bounded gallery ZIP archival.
- Production external broadcast providers beyond configured in-app/e-mail delivery.
- Broader post-wedding workflows.

### TECHNICAL DEBT

- The generic historical frontend inventory still contains pre-implementation static scan entries; the canonical Slice 8 reconciliation supersedes those mappings.
- Worker-side contact export decryption currently uses the active sensitive-data key; a future sensitive-data keyring should support rolling old-key retention independently from the outbox keyring.

### BLOCKER

- None for the implemented Slice 8 scope.

## Verdict

`READY FOR SLICE 9`
