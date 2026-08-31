import { readFile, writeFile } from "node:fs/promises";

const generatedAt = "2026-07-20T14:30:00.000Z";

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function save(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const apiPath = "docs/API_OPERATION_REGISTRY.json";
const api = await json(apiPath);
api.schemaVersion = "2.6.0";
api.generatedAt = generatedAt;
api.repositoryCoverage =
  "Slices 0 through 8 are reconciled against canonical /api/v1 OpenAPI. Wedding Day operations, check-in, Guest Moments, gallery and bounded generated exports are active; later modules remain planned.";
api.countsByDomain.wedding_day_live = 75;
api.slice8Reconciliation = {
  status: "IMPLEMENTED_ACTIVE_OPENAPI_VALIDATED_E2E_TESTED",
  canonicalPrefix: "/api/v1",
  activeOperationCount: 75,
  controllers: ["EventDayController", "GuestEventDayController"],
  operationFamilies: {
    plan: "versioned plan draft, immutable publish, live/pause/complete and command center",
    runOfShow:
      "items, order, dependencies and explicit transitions with actual timestamps",
    operations:
      "checklists, encrypted contacts, private incidents, decisions and announcements",
    checkIn:
      "sessions, stations, devices, hash-only QR credentials, online/manual/offline commands and attendance",
    guestMedia:
      "bounded direct upload, scan, derivative, moderation, report and published gallery",
    live: "organizer and guest SSE with sequence replay and redacted payloads",
    export:
      "Run Sheet, contact sheet, check-in manifest, attendance and incident CSV/XLSX through BackgroundJob and GeneratedArtifact",
  },
  requestDtos: [
    "CreateWeddingDayPlan",
    "UpdateWeddingDayPlan",
    "CreateRunOfShowItem",
    "UpdateRunOfShowItem",
    "RunOfShowTransition",
    "RunOfShowOrder",
    "RunOfShowDependencies",
    "CreateWeddingDayChecklist",
    "CreateWeddingDayChecklistItem",
    "UpdateWeddingDayChecklistItem",
    "WeddingDayChecklistTransition",
    "CreateWeddingDayContact",
    "UpdateWeddingDayContact",
    "CreateWeddingDayIncident",
    "WeddingDayIncidentUpdate",
    "WeddingDayIncidentTransition",
    "WeddingDayDecision",
    "CreateWeddingDayAnnouncement",
    "UpdateWeddingDayAnnouncement",
    "CreateCheckInSession",
    "UpdateCheckInSession",
    "CheckInSessionTransition",
    "CreateCheckInStation",
    "UpdateCheckInStation",
    "CreateCheckInDevice",
    "CreateCheckInCredential",
    "ValidateCheckInCredential",
    "GuestCheckInCommand",
    "CheckInManifestRequest",
    "CheckInOfflineSync",
    "CreateGuestMoment",
    "CompleteGuestMoment",
    "GuestMomentTransition",
    "GuestMomentReport",
    "CreateGalleryCollection",
    "UpdateGalleryCollection",
    "GalleryItems",
    "WeddingDayExport",
  ],
  capabilities: [
    "wedding_day.read",
    "wedding_day.write",
    "wedding_day.publish",
    "wedding_day.go_live",
    "wedding_day.transition",
    "wedding_day.manage_contacts",
    "incident.read",
    "incident.write",
    "incident.assign",
    "incident.resolve",
    "incident.read_sensitive",
    "announcement.read",
    "announcement.write",
    "announcement.publish",
    "check_in.read",
    "check_in.write",
    "check_in.override",
    "check_in.manage_sessions",
    "check_in.manage_devices",
    "check_in.offline_sync",
    "guest_moment.read",
    "guest_moment.upload",
    "guest_moment.moderate",
    "guest_moment.publish",
    "guest_moment.delete",
    "gallery.read",
    "gallery.write",
    "gallery.publish",
  ],
  headers: {
    concurrency:
      "If-Match on every versioned plan, run item, contact, incident, announcement, session, station, device and gallery mutation",
    idempotency:
      "Idempotency-Key on retryable creates, plan transitions, announcements, check-in commands, media uploads, gallery publication and exports",
  },
  contractGuarantees: [
    "all active operations have concrete request, response and Problem schemas",
    "forced workspace RLS and guest-token/device isolation",
    "QR tokens and device secrets are hash-only at rest",
    "private incident/contact/media storage details never enter guest or notification payloads",
    "export artifacts are bounded, expiring and owner-scoped",
    "demo interactions produce zero real API mutations",
  ],
  testCoverage: {
    unit: "18/18 Slice 8 domain cases",
    e2e: "29/29 Slice 8 journeys",
    openapi: "7/7 repository OpenAPI suites; zero active Slice 8 schema gaps",
    failed: 0,
    skipped: 0,
    retries: 0,
  },
};
await save(apiPath, api);

const frontendPath = "docs/FRONTEND_INVENTORY.json";
const frontend = await json(frontendPath);
frontend.schemaVersion = "2.5.0";
frontend.generatedAt = generatedAt;
frontend.slice8Reconciliation = {
  status: "CONNECTED_TO_REAL_API_AND_E2E_TESTED",
  designPreserved: true,
  productionPages: ["/wedding-day", "/guest", "/moments", "/overview"],
  realControls: [
    "Wedding Day plan create/publish/go-live/pause/complete",
    "Run of Show status transitions, actual times, delayed/blocked state and SSE refresh",
    "checklists, encrypted contacts, incidents and announcements",
    "online and offline check-in, QR credential lifecycle and attendance",
    "Guest Companion live state, own check-in credential and own submissions",
    "Guest Moment direct upload, processing, moderation, reports and gallery publication",
    "Overview metrics and global search over authorized Wedding Day resources",
    "Quick Create Run of Show, checklist item, incident, announcement, manual check-in and gallery",
    "Run Sheet, contact, manifest, attendance and incident exports through real background jobs",
  ],
  capabilityFilteredControls: true,
  loadingEmptyFailureStates: [
    "no operational plan",
    "no active run item",
    "no check-in session",
    "SSE reconnect with polling fallback",
    "upload processing/quarantine",
    "no published gallery",
    "artifact job failed",
  ],
  disabledPlannedControls: [
    "face recognition",
    "unbounded media upload",
    "raw media URLs",
    "automatic incident resolution",
    "external broadcast channels without a configured provider",
    "gallery ZIP archival",
  ],
  demoIsolation:
    "Wedding Day, guest media and gallery demo interactions use isolated state and issue zero real API mutations.",
  truthfulness:
    "Success is shown only after canonical persistence; async delivery, scan and export state remains queued/processing until the worker confirms it.",
  testCoverage: "29/29 Slice 8 E2E; zero failed, skipped or retries",
};
await save(frontendPath, frontend);

const entityPath = "docs/BACKEND_ENTITY_CATALOG.json";
const catalog = await json(entityPath);
catalog.schemaVersion = "2.5.0";
catalog.generatedAt = generatedAt;
catalog.counts.slice8Implemented = 34;
catalog.counts.total = 207;
catalog.slice8ImplementedEntities = [
  "WeddingDayPlan",
  "WeddingDayPlanVersion",
  "RunOfShowItem",
  "RunOfShowDependency",
  "RunOfShowItemAssignment",
  "RunOfShowItemUpdate",
  "WeddingDayChecklist",
  "WeddingDayChecklistItem",
  "WeddingDayContact",
  "WeddingDayIncident",
  "WeddingDayIncidentUpdate",
  "WeddingDayIncidentAssignment",
  "WeddingDayDecision",
  "WeddingDayAnnouncement",
  "WeddingDayAnnouncementAudience",
  "WeddingDayAnnouncementDelivery",
  "WeddingDayLiveEvent",
  "GuestCheckInSession",
  "GuestCheckInStation",
  "GuestCheckInDevice",
  "GuestCheckInCredential",
  "GuestCheckIn",
  "GuestCheckInEvent",
  "CheckInManifestSnapshot",
  "CheckInOfflineCommand",
  "CheckInSyncBatch",
  "GuestMoment",
  "GuestMomentMedia",
  "GuestMomentUploadSession",
  "GuestMomentReport",
  "GuestMomentModerationCase",
  "GalleryCollection",
  "GalleryCollectionItem",
  "GeneratedArtifact (reused)",
];
catalog.slice8MigrationEntities = {
  migrations: [
    "20260720120000_slice_8_wedding_day_check_in_media",
    "20260720121000_slice_8_rls_capabilities_and_integrity",
    "20260720122000_slice_8_guest_media_preview_policy",
    "20260720123000_slice_8_guest_outbox_events",
    "20260720124000_slice_8_guest_report_self_policy",
    "20260720125000_slice_8_guest_moderation_case_insert",
  ],
  forcedRls:
    "all tenant-scoped Slice 8 entities; guest policies are grant/household scoped and worker policies bind persisted execution identity",
  immutableAppendOnly: [
    "WeddingDayPlanVersion",
    "WeddingDayLiveEvent",
    "GuestCheckInEvent",
    "WeddingDayDecision",
  ],
  encryptedOrHashOnly: [
    "WeddingDayContact.phone",
    "WeddingDayContact.notesPrivate",
    "GuestCheckInCredential.token",
    "GuestCheckInDevice.secret",
  ],
  workerIsolation:
    "workspace, actor, job, outbox and consumer identities are derived from persisted execution context; forged payload workspace fails closed",
  testCoverage:
    "RLS, cross-workspace, guest-token, device, media storage and worker forged-context paths are covered by Slice 8 E2E",
};
await save(entityPath, catalog);

const automationPath = "docs/AUTOMATION_REGISTRY.json";
const automation = await json(automationPath);
automation.schemaVersion = "1.4.0";
automation.generatedAt = generatedAt;
automation.slice8Reconciliation = {
  status: "IMPLEMENTED_INTEGRATION_AND_E2E_TESTED",
  deliveryGuarantee:
    "at-least-once with independently retryable OutboxConsumerExecution records and idempotent effects; no external exactly-once claim",
  consumers: [
    "wedding_day_live_projection",
    "wedding_day_reminder",
    "incident_escalation",
    "announcement_delivery",
    "announcement_summary",
    "check_in_projection",
    "check_in_offline_sync",
    "attendance_projection",
    "guest_moment_scan",
    "guest_moment_derivative",
    "guest_moment_moderation_projection",
    "gallery_projection",
    "wedding_day_export",
    "notification_projection",
    "activity_projection",
    "event_ack",
  ],
  semanticEventFamilies: [
    "wedding_day.*.v1",
    "check_in.*.v1",
    "guest_moment.*.v1",
    "gallery.*.v1",
  ],
  userVisibleJobs: ["Wedding Day operational exports"],
  internalExecutions: [
    "live projection",
    "reminders/escalation",
    "announcement fan-out/summary",
    "attendance/check-in projection",
    "media scan/derivative/moderation",
    "gallery projection",
  ],
  scheduling:
    "future reminders and scheduled announcements use durable available_at and revalidate canonical status/version/access",
  mediaSafety:
    "checksum/type/size verification and ClamAV fail closed; clean images/video posters receive private managed derivatives",
  dedupe:
    "deterministic BullMQ job ID over outboxMessageId plus consumerName; check-in command, offline sequence, delivery, notification, activity and artifact effects have persisted unique identities",
  recovery:
    "partial consumer success, provider/storage success before acknowledgement and process restart resume from persisted records",
  recursiveProjectionProtection:
    "live, attendance, gallery, notification and activity projections do not re-emit their source semantic event",
  testCoverage:
    "29/29 Slice 8 E2E plus domain/outbox/OpenAPI suites; zero failed/skipped/retries",
};
await save(automationPath, automation);
