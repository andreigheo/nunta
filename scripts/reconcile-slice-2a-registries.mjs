import { readFile, writeFile } from "node:fs/promises";

const root = process.cwd();
const readJson = async (name) =>
  JSON.parse(await readFile(`${root}/docs/${name}`, "utf8"));
const writeJson = async (name, value) =>
  writeFile(`${root}/docs/${name}`, `${JSON.stringify(value, null, 2)}\n`);

const tested = [
  "IMPLEMENTED",
  "UNIT_TESTED",
  "INTEGRATION_TESTED",
  "E2E_TESTED",
];

const api = await readJson("API_OPERATION_REGISTRY.json");
const apiContracts = {
  "ONBOARDING.GET": [
    null,
    "OnboardingDraft",
    ["onboarding.draft_updated.v1"],
    [],
  ],
  "ONBOARDING.UPDATE": [
    "UpdateOnboardingDraft",
    "OnboardingDraft",
    ["onboarding.draft_updated.v1"],
    ["domain-event.consumer.v1"],
  ],
  "ONBOARDING.COMPLETE": [
    null,
    "CompleteOnboardingResponse",
    ["onboarding.ready_for_plan_generation.v1"],
    ["domain-event.consumer.v1"],
  ],
  "JOB.GET": [null, "BackgroundJob", [], []],
  "NOTIFICATION.LIST": [null, "NotificationList", [], []],
  "NOTIFICATION.UNREAD_COUNT": [null, "UnreadNotificationCount", [], []],
  "NOTIFICATION.UPDATE": [
    "UpdateNotificationRequest",
    "Notification",
    ["notification.read.v1"],
    [],
  ],
  "NOTIFICATION.MARK_ALL_READ": [
    null,
    "MarkAllNotificationsRead",
    ["notification.read.v1"],
    [],
  ],
  "NOTIFICATION.DELETE": [null, "NoContent", ["notification.dismissed.v1"], []],
  "ACTIVITY.LIST": [null, "ActivityList", [], []],
  "ACTIVITY.EXPORT": [
    "ActivityExportRequest",
    "BackgroundJob",
    ["activity.export_requested.v1"],
    ["domain-event.consumer.v1"],
  ],
};
for (const operation of api.operations) {
  const contract = apiContracts[operation.id];
  if (contract) {
    const [requestSchema, responseSchema, events, jobs] = contract;
    operation.currentBackendCoverage = "IMPLEMENTED_SLICE_2A";
    operation.implementationStatus = "active";
    operation.requestSchema = requestSchema;
    operation.responseSchema = responseSchema;
    operation.eventsEmitted = events;
    operation.jobsTriggered = jobs;
    operation.handoffStatuses = tested;
  }
  if (["NOTIFICATION.UPDATE", "NOTIFICATION.DELETE"].includes(operation.id)) {
    operation.route =
      "/api/v1/workspaces/:workspaceId/notifications/:notificationId";
    operation.request.path = [":workspaceId", ":notificationId"];
    operation.permissions = ["workspace.read"];
  }
  if (operation.id === "NOTIFICATION.DELETE") {
    operation.concurrency =
      "owner/workspace-scoped delete; not found is fail-closed";
  }
  if (operation.id === "NOTIFICATION.MARK_ALL_READ") {
    operation.idempotency =
      "naturally idempotent set update; no Idempotency-Key required";
  }
  if (operation.id === "ONBOARDING.COMPLETE") {
    operation.idempotency =
      "Idempotency-Key required; every replay converges on one readiness event and visible job";
    operation.concurrency =
      "If-Match required; stale versions return 412 and missing preconditions return 428";
    operation.errors = [
      ...new Set([
        ...operation.errors,
        "PRECONDITION_REQUIRED",
        "VERSION_CONFLICT",
      ]),
    ];
  }
  if (
    [
      "AUTH.REGISTER",
      "AUTH.MAGIC_LINK_REQUEST",
      "AUTH.EMAIL_VERIFICATION_REQUEST",
      "AUTH.PASSWORD_RESET_REQUEST",
      "AUTH.PASSWORD_RESET",
      "TEAM.INVITATION_CREATE",
      "TEAM.INVITATION_RESEND",
    ].includes(operation.id)
  ) {
    operation.currentBackendCoverage = "IMPLEMENTED_SLICE_2A_ASYNC_DELIVERY";
    operation.jobsTriggered = ["domain-event.consumer.v1"];
    operation.handoffStatuses = tested;
  }
}
if (!api.operations.some((operation) => operation.id === "JOB.ARTIFACT_GET")) {
  api.operations.push({
    id: "JOB.ARTIFACT_GET",
    domain: "bootstrap_search_notifications_activity",
    method: "GET",
    route: "/api/v1/jobs/:jobId/artifact",
    purpose: "Download a completed user-owned activity export artifact",
    request: { path: ["jobId"], query: [], body: [] },
    requestSchema: null,
    response: { data: "text/csv binary", meta: [] },
    responseSchema: "CsvArtifact",
    permissions: ["authenticated job creator"],
    validation: [
      "UUID job id",
      "completed job",
      "creator ownership",
      "fixed artifact name",
    ],
    errors: ["UNAUTHENTICATED", "JOB_NOT_FOUND", "NOT_FOUND"],
    idempotency: "read-only",
    concurrency: "read-only durable job result",
    audit: false,
    eventsEmitted: [],
    jobsTriggered: [],
    currentBackendCoverage: "IMPLEMENTED_SLICE_2A",
    reusedBy: ["UI-0014"],
    implementationStatus: "active",
    handoffStatuses: tested,
  });
}
api.count = api.operations.length;
api.countsByDomain.bootstrap_search_notifications_activity =
  api.operations.filter(
    (operation) =>
      operation.domain === "bootstrap_search_notifications_activity",
  ).length;
api.slice2aReconciliation = {
  status: "IMPLEMENTED_AND_TESTED",
  openApiSchemas: 52,
  durableExecution: "OutboxConsumerExecution/PostgreSQL",
  userVisibleJobs: [
    "activity.export_requested.v1",
    "onboarding.ready_for_plan_generation.v1",
  ],
  generatedArtifact:
    "GeneratedArtifact with owner-authorized download and expiry cleanup",
  deliveryGuarantee:
    "at-least-once with idempotent database effects where supported",
  transport: "BullMQ/Redis",
  workerRole: "weddingos_worker",
};
await writeJson("API_OPERATION_REGISTRY.json", api);

const entities = await readJson("BACKEND_ENTITY_CATALOG.json");
for (const entity of entities.entities) {
  if (
    [
      "OutboxMessage",
      "OutboxConsumerExecution",
      "BackgroundJob",
      "DeliveryAttempt",
      "Notification",
      "OnboardingDraft",
      "GeneratedArtifact",
    ].includes(entity.name)
  ) {
    entity.currentImplementationStatus =
      "IMPLEMENTED_SLICE_2A_MIGRATED_RLS_TESTED";
  }
  if (entity.name === "OutboxMessage") {
    Object.assign(entity, {
      aggregate: "TransactionalOutbox",
      storageKind: "durable_delivery_intent",
      whyPersistent:
        "Commits semantic delivery intent atomically with authoritative state and survives Redis or worker loss.",
      fieldsDefinition:
        "event/aggregate/version, workspace/actor/correlation/idempotency/dedupe, redacted payload, versioned encrypted command, aggregate status and retry metadata",
      relationships: [
        "OutboxConsumerExecution[]",
        "BackgroundJob optional",
        "Workspace/User optional persisted context",
      ],
      tenantScope: "persisted workspace and actor context",
      lifecycle:
        "pending -> processing/failed -> processed or dead_letter, reconciled from required consumers",
      statuses: [
        "pending",
        "enqueued",
        "processing",
        "processed",
        "failed",
        "dead_letter",
      ],
      indexes: [
        "UNIQUE (deduplication_key)",
        "INDEX (status, available_at)",
        "INDEX (workspace_id, created_at)",
        "INDEX (event_name, created_at)",
      ],
      piiClassification: "redacted_payload_plus_encrypted_bounded_command",
      retention: "operational outbox retention after terminal state",
    });
  }
  if (entity.name === "BackgroundJob") {
    Object.assign(entity, {
      aggregate: "UserVisibleBackgroundWork",
      storageKind: "user_visible_job_record",
      whyPersistent:
        "Exposes only intentionally user-visible asynchronous work across browser, worker and Redis restarts.",
      fieldsDefinition:
        "workspace/actor,type,user_visible,status,progress,input/result metadata,error,attempts,availability,heartbeat and terminal timestamps",
      relationships: [
        "OutboxMessage optional",
        "OutboxConsumerExecution[]",
        "GeneratedArtifact optional",
      ],
      tenantScope: "requesting actor and optional wedding workspace",
      lifecycle:
        "queued -> running/retrying -> completed or dead_letter; not created for internal projections/email",
      statuses: [
        "queued",
        "running",
        "retrying",
        "completed",
        "failed",
        "cancelled",
        "dead_letter",
      ],
      indexes: [
        "UNIQUE (deduplication_key)",
        "INDEX (actor_user_id, created_at)",
        "INDEX (workspace_id, status, created_at)",
      ],
    });
  }
  if (entity.name === "DeliveryAttempt") {
    Object.assign(entity, {
      aggregate: "ConsumerDelivery",
      storageKind: "redacted_provider_attempt",
      whyPersistent:
        "Records at-least-once provider attempts and the provider-acknowledged crash window independently per email consumer.",
      fieldsDefinition:
        "consumer execution, optional visible job/workspace, provider, recipient hash, attempt, outcome, provider message id, redacted error and timestamps",
      relationships: ["OutboxConsumerExecution", "BackgroundJob optional"],
      tenantScope: "persisted consumer workspace context",
      lifecycle:
        "one immutable/upserted row per consumer execution and attempt number",
      statuses: ["succeeded", "retryable_failure", "permanent_failure"],
      indexes: [
        "UNIQUE (consumer_execution_id, attempt_number)",
        "INDEX (workspace_id, created_at)",
      ],
      piiClassification: "recipient_sha256_and_redacted_provider_metadata",
      retention: "security and delivery operations retention policy",
    });
  }
}
for (const entity of [
  {
    name: "OutboxConsumerExecution",
    group: "Infrastructure și async operations",
    aggregate: "TransactionalOutbox",
    storageKind: "durable_consumer_ledger",
    persistent: true,
    whyPersistent:
      "Tracks independent delivery and projection consumers across Redis or worker failure.",
    commonFields: [
      "id: uuid",
      "outbox_message_id: uuid",
      "consumer_name: enum",
      "status/attempts/max_attempts",
      "available_at/locked_at/locked_by",
      "started_at/heartbeat_at/completed_at",
      "last_error_code/last_error_message",
      "deduplication_key: unique",
    ],
    fieldsDefinition:
      "outbox and optional visible-job reference, independent lifecycle, lock, completion, redacted error and dedupe metadata",
    relationships: [
      "OutboxMessage",
      "BackgroundJob optional",
      "DeliveryAttempt[]",
      "GeneratedArtifact optional",
    ],
    tenantScope: "persisted outbox workspace and actor context",
    lifecycle:
      "Claimed and reconciled from PostgreSQL; BullMQ remains transport only.",
    statuses: [
      "pending",
      "enqueued",
      "processing",
      "completed",
      "failed",
      "dead_letter",
    ],
    indexes: [
      "UNIQUE (outbox_message_id, consumer_name)",
      "UNIQUE (deduplication_key)",
      "INDEX (status, available_at)",
      "INDEX (locked_at)",
    ],
    piiClassification: "redacted_operational_metadata",
    retention: "outbox operational retention policy",
    currentImplementationStatus: "IMPLEMENTED_SLICE_2A_MIGRATED_RLS_TESTED",
  },
  {
    name: "GeneratedArtifact",
    group: "Infrastructure și async operations",
    aggregate: "GeneratedArtifact",
    storageKind: "managed_artifact_metadata",
    persistent: true,
    whyPersistent:
      "Provides a durable owner-authorized lifecycle for bounded asynchronous exports without CSV bytes in job JSON or temporary paths.",
    commonFields: [
      "id: uuid",
      "background_job_id/consumer_execution_id: uuid unique",
      "workspace_id/owner_user_id: uuid",
      "status/storage_key/file_name/media_type",
      "size_bytes/sha256/row_count",
      "ready_at/expires_at/deleted_at",
    ],
    fieldsDefinition:
      "managed storage identity, authorization, checksum, limits, readiness, expiry and deletion metadata",
    relationships: [
      "BackgroundJob",
      "OutboxConsumerExecution",
      "Workspace",
      "User owner",
    ],
    tenantScope: "wedding_workspace plus requesting owner",
    lifecycle:
      "generating -> ready -> expired -> deleted; failed generation remains auditable",
    statuses: ["generating", "ready", "failed", "expired", "deleted"],
    indexes: [
      "UNIQUE (background_job_id)",
      "UNIQUE (consumer_execution_id)",
      "UNIQUE (storage_key)",
      "INDEX (owner_user_id, status)",
      "INDEX (status, expires_at)",
    ],
    piiClassification: "bounded_redacted_business_export",
    retention: "24-hour local default followed by managed deletion",
    currentImplementationStatus: "IMPLEMENTED_SLICE_2A_MIGRATED_RLS_TESTED",
  },
  {
    name: "ActivityItem",
    group: "Infrastructure și read models",
    aggregate: "ActivityProjection",
    storageKind: "derived_read_model",
    persistent: true,
    whyPersistent:
      "Queryable redacted projection of semantic domain events for the workspace activity feed.",
    commonFields: [
      "id: uuid",
      "workspace_id: uuid",
      "occurred_at: timestamptz",
      "source_event_id: uuid unique",
      "correlation_id/deduplication_key: text unique",
    ],
    fieldsDefinition:
      "actor_type/actor_id, category, action, resource reference, redacted summary, deep link metadata, visibility scope",
    relationships: [
      "Workspace",
      "User optional",
      "OutboxMessage by immutable source_event_id",
    ],
    tenantScope: "wedding_workspace",
    lifecycle:
      "Idempotent worker projection; never an independent source of truth.",
    statuses: ["immutable projection"],
    indexes: [
      "UNIQUE (source_event_id)",
      "INDEX (workspace_id, occurred_at)",
      "INDEX (workspace_id, category, occurred_at)",
      "UNIQUE (deduplication_key)",
    ],
    piiClassification: "redacted_business_activity",
    retention: "workspace audit/read-model retention policy",
    currentImplementationStatus: "IMPLEMENTED_SLICE_2A_MIGRATED_RLS_TESTED",
  },
  {
    name: "WorkerHeartbeat",
    group: "Infrastructure și async operations",
    aggregate: "WorkerRuntime",
    storageKind: "operational_state",
    persistent: true,
    whyPersistent:
      "Makes worker liveness visible to API readiness without treating Redis as durable truth.",
    commonFields: [
      "id: worker identifier",
      "last_seen_at: timestamptz",
      "started_at: timestamptz",
    ],
    fieldsDefinition:
      "role, redacted host/process/queue metadata, last seen and start timestamps",
    relationships: ["No tenant ownership; RLS-bound to current worker id"],
    tenantScope: "system_worker",
    lifecycle: "Upserted by the restricted worker and read by readiness.",
    statuses: ["healthy or stale derived from last_seen_at"],
    indexes: ["PRIMARY KEY (id)", "INDEX (last_seen_at)"],
    piiClassification: "operational_metadata",
    retention: "operational cleanup policy",
    currentImplementationStatus: "IMPLEMENTED_SLICE_2A_MIGRATED_RLS_TESTED",
  },
]) {
  const existing = entities.entities.find(
    (candidate) => candidate.name === entity.name,
  );
  if (existing) Object.assign(existing, entity);
  else entities.entities.push(entity);
}
entities.counts.normalizedPersistentEntities = entities.entities.length;
entities.counts.implementedSlice2A = entities.entities.filter((entity) =>
  entity.currentImplementationStatus?.includes("SLICE_2A"),
).length;
entities.slice2aImplementedEntities = entities.entities
  .filter((entity) => entity.currentImplementationStatus?.includes("SLICE_2A"))
  .map((entity) => entity.name)
  .sort();
entities.repositoryCoverage =
  "Slice 0/1 has 15 implemented models and Slice 2A adds or hardens the nine listed async/projection models; the broader target catalog remains planned.";
entities.slice2aMigrationEntities = [
  [
    "OutboxMessage",
    "outbox_messages",
    "20260718100106_slice_2a_async_foundation",
  ],
  [
    "BackgroundJob",
    "background_jobs",
    "20260718100106_slice_2a_async_foundation",
  ],
  [
    "DeliveryAttempt",
    "delivery_attempts",
    "20260718100106_slice_2a_async_foundation",
  ],
  ["Notification", "notifications", "20260718100106_slice_2a_async_foundation"],
  [
    "ActivityItem",
    "activity_items",
    "20260718100106_slice_2a_async_foundation",
  ],
  [
    "OnboardingDraft",
    "onboarding_drafts",
    "20260718100106_slice_2a_async_foundation",
  ],
  [
    "WorkerHeartbeat",
    "worker_heartbeats",
    "20260718100106_slice_2a_async_foundation",
  ],
  [
    "OutboxConsumerExecution",
    "outbox_consumer_executions",
    "20260718155000_slice_2a_consumer_hardening",
  ],
  [
    "GeneratedArtifact",
    "generated_artifacts",
    "20260718155000_slice_2a_consumer_hardening",
  ],
].map(([name, table, migration]) => ({
  name,
  table,
  migration,
  handoffStatuses: tested,
}));
await writeJson("BACKEND_ENTITY_CATALOG.json", entities);

const automations = await readJson("AUTOMATION_REGISTRY.json");
const automationUpdates = {
  "AUTO-001": {
    sourceEvent: "workspace.created.v1",
    producer: "WorkspacesService transactional outbox",
    consumers: ["notification projection", "activity projection"],
    synchronousEffects: [
      "workspace, owner membership, wedding profile, audit, outbox and consumer intents commit atomically",
    ],
    asynchronousEffects: ["owner notification", "workspace activity item"],
  },
  "AUTO-002": {
    sourceEvent: "onboarding.ready_for_plan_generation.v1",
    producer: "OnboardingService transactional outbox",
    consumers: ["notification projection", "activity projection"],
    synchronousEffects: [
      "validate eight confirmed sections and transition draft to ready",
    ],
    asynchronousEffects: ["ready notification", "activity projection"],
    confirmation: "does not generate a plan; Slice 2B remains required",
  },
  "AUTO-005": {
    sourceEvent: "membership.invited.v1",
    producer: "TeamService transactional outbox",
    consumers: ["SMTP email", "owner notification", "activity projection"],
    synchronousEffects: [
      "pending invitation, audit, outbox and consumer intents commit atomically",
    ],
    asynchronousEffects: [
      "encrypted email command",
      "owner notification",
      "redacted activity item",
    ],
  },
};
for (const automation of automations.automations) {
  const update = automationUpdates[automation.id];
  if (!update) continue;
  Object.assign(automation, update, {
    idempotencyKey:
      "outbox dedupe plus deterministic outbox-and-consumer BullMQ job id",
    retryPolicy:
      "bounded exponential backoff; retryable classification; persistent dead-letter",
    currentBackendCoverage: "IMPLEMENTED_SLICE_2A_INTEGRATION_AND_E2E_TESTED",
    evidence:
      "OutboxMessage + OutboxConsumerExecution + weddingos-domain-events worker",
  });
}
for (const automation of [
  ["AUTO-041", "user.registered.v1", "registration verification email"],
  ["AUTO-042", "password.reset_requested.v1", "password reset email"],
  ["AUTO-043", "magic_link.requested.v1", "magic-link email"],
]) {
  if (automations.automations.some((existing) => existing.id === automation[0]))
    continue;
  automations.automations.push({
    id: automation[0],
    sourceEvent: automation[1],
    producer: "AuthService transactional outbox",
    consumers: [automation[2], "delivery attempt"],
    synchronousEffects: [
      "domain state, hashed one-time token, outbox and consumer intents commit atomically",
    ],
    asynchronousEffects: [
      "worker decrypts minimal command and sends through SMTP",
    ],
    idempotencyKey:
      "unique outbox dedupe key and deterministic outbox-and-consumer BullMQ job id",
    retryPolicy:
      "bounded exponential backoff; retryable SMTP errors; dead-letter",
    notifications: ["security email cannot be disabled"],
    audit: true,
    confirmation:
      "request accepted after durable commit, before provider delivery",
    failureHandling:
      "Committed state remains; internal consumer execution becomes retrying or dead_letter without exposing a user job.",
    currentBackendCoverage: "IMPLEMENTED_SLICE_2A_INTEGRATION_TESTED",
    evidence:
      "Real Mailpit outage and recovery proof with one delivered message",
  });
}
automations.count = automations.automations.length;
await writeJson("AUTOMATION_REGISTRY.json", automations);

const frontend = await readJson("FRONTEND_INVENTORY.json");
const realControls = new Map([
  [
    "UI-0014",
    [
      "real_api_call_or_real_api_backed_handler",
      "Activity export creates and polls a durable job, then downloads its CSV artifact.",
    ],
  ],
  [
    "UI-0402",
    [
      "real_api_call_or_real_api_backed_handler",
      "Invite dialog calls TEAM.INVITATION_CREATE; demo is centrally blocked.",
    ],
  ],
  [
    "UI-0495",
    [
      "real_api_call_or_real_api_backed_handler",
      "Persists the current onboarding step with If-Match before leaving.",
    ],
  ],
  [
    "UI-0504",
    [
      "real_api_call_or_real_api_backed_handler",
      "Persists every step incrementally with optimistic concurrency.",
    ],
  ],
  [
    "UI-0506",
    [
      "real_api_call_or_real_api_backed_handler",
      "Finalizes data as ready only; the UI explicitly states that plan generation is not started.",
    ],
  ],
  [
    "UI-0565",
    [
      "real_api_call_or_real_api_backed_handler",
      "PATCH owned notification with If-Match.",
    ],
  ],
  [
    "UI-0568",
    [
      "real_api_call_or_real_api_backed_handler",
      "PATCH owned notification with If-Match.",
    ],
  ],
  [
    "UI-0569",
    [
      "real_api_call_or_real_api_backed_handler",
      "DELETE owned notification through the real API.",
    ],
  ],
  [
    "UI-0570",
    [
      "real_api_call_or_real_api_backed_handler",
      "Marks all notifications read in the current workspace.",
    ],
  ],
]);
for (const control of frontend.controls) {
  const update = realControls.get(control.id);
  if (update) {
    control.currentBehavior = update[0];
    control.currentBehaviorEvidence = update[1];
    control.currentBackendCoverage = "IMPLEMENTED_SLICE_2A";
    control.handoffStatuses = tested;
  }
  if (
    [
      "UI-0501",
      "UI-0392",
      "UI-0393",
      "UI-0541",
      "UI-0542",
      "UI-0543",
      "UI-0573",
    ].includes(control.id)
  ) {
    control.currentBehavior = "disabled_planned_control";
    control.currentBehaviorEvidence =
      "Disabled in production until the owning backend/storage/AI module exists; no success is emitted.";
    control.currentBackendCoverage = "PLANNED_DISABLED_NO_FALSE_SUCCESS";
    control.handoffStatuses = ["PLANNED"];
  }
  if (control.id === "UI-0579") {
    control.controlLabel = "Notificări — număr real din API";
    control.currentBehaviorEvidence =
      "Opens the real API-backed NotificationsDrawer; no seeded global count.";
    control.currentBackendCoverage = "IMPLEMENTED_SLICE_2A_READ_SURFACE";
  }
}
frontend.repositoryReconciliation.slice2a = {
  status: "IMPLEMENTED_AND_E2E_TESTED",
  realSurfaces: ["NotificationsDrawer", "ActivityPage", "OnboardingPage"],
  centralPolicies: [
    "demo transport deny",
    "401 session invalidation",
    "403 access-denied",
    "409/412 no silent overwrite",
    "428 required-precondition handling",
  ],
  disabledFalseActions: [
    "Quick Create mutations",
    "AI apply/send/attachments",
    "account export",
    "access-log claim",
    "uploads",
  ],
};
frontend.repositoryReconciliation.packageManifests = [
  ...new Set([
    ...frontend.repositoryReconciliation.packageManifests,
    "apps/worker/package.json",
    "packages/jobs/package.json",
  ]),
];
frontend.repositoryReconciliation.projectStructure =
  "pnpm workspace; Next.js frontend remains in root; NestJS API is in apps/api; durable BullMQ worker is in apps/worker; shared contracts/config/database/jobs packages are in packages/*";
frontend.repositoryReconciliation.directories["apps/worker"] = true;
frontend.repositoryReconciliation.automatedTestSuites = 5;
await writeJson("FRONTEND_INVENTORY.json", frontend);
