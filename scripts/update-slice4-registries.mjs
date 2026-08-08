import { readFile, writeFile } from "node:fs/promises";

const generatedAt = "2026-07-19T12:00:00.000Z";
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const operationsDocument = await readJson("docs/API_OPERATION_REGISTRY.json");
const definitions = [
  ["GET", "venue-spaces", "seating.read"],
  ["POST", "venue-spaces", "seating.write"],
  ["GET", "venue-spaces/:spaceId", "seating.read"],
  ["PATCH", "venue-spaces/:spaceId", "seating.write"],
  ["DELETE", "venue-spaces/:spaceId", "seating.write"],
  ["GET", "seating-plans", "seating.read"],
  ["POST", "seating-plans", "seating.write"],
  ["GET", "seating-plans/:planId", "seating.read"],
  ["PATCH", "seating-plans/:planId", "seating.write"],
  ["DELETE", "seating-plans/:planId", "seating.write"],
  ["POST", "seating-plans/:planId/publish", "seating.publish"],
  ["POST", "seating-plans/:planId/unpublish", "seating.publish"],
  ["POST", "seating-plans/:planId/tables", "seating.write"],
  ["PATCH", "seating-plans/:planId/tables/:tableId", "seating.write"],
  ["DELETE", "seating-plans/:planId/tables/:tableId", "seating.write"],
  [
    "PATCH",
    "seating-plans/:planId/tables/:tableId/seats/:seatId",
    "seating.write",
  ],
  ["PUT", "seating-plans/:planId/assignments", "seating.assign"],
  [
    "DELETE",
    "seating-plans/:planId/assignments/:assignmentId",
    "seating.assign",
  ],
  ["GET", "seating-plans/:planId/constraints", "seating.read"],
  ["POST", "seating-plans/:planId/constraints", "seating.write"],
  ["PATCH", "seating-plans/:planId/constraints/:constraintId", "seating.write"],
  [
    "DELETE",
    "seating-plans/:planId/constraints/:constraintId",
    "seating.write",
  ],
  ["GET", "seating-plans/:planId/issues", "seating.read"],
  ["PATCH", "seating-plans/:planId/issues/:issueId", "seating.write"],
  ["POST", "seating-plans/:planId/suggestions", "seating.generate_suggestion"],
  ["GET", "seating-plans/:planId/suggestions/:suggestionId", "seating.read"],
  [
    "POST",
    "seating-plans/:planId/suggestions/:suggestionId/apply",
    "seating.assign",
  ],
  ["POST", "seating-plans/:planId/exports", "seating.export"],
  ["GET", "transport-requests", "transport.read"],
  ["PATCH", "transport-requests/:requestId", "transport.write"],
  ["GET", "transport-plans", "transport.read"],
  ["POST", "transport-plans", "transport.write"],
  ["GET", "transport-plans/:planId", "transport.read"],
  ["PATCH", "transport-plans/:planId", "transport.write"],
  ["DELETE", "transport-plans/:planId", "transport.write"],
  ["POST", "transport-plans/:planId/publish", "transport.publish"],
  ["POST", "transport-plans/:planId/vehicles", "transport.write"],
  ["PATCH", "transport-plans/:planId/vehicles/:vehicleId", "transport.write"],
  ["DELETE", "transport-plans/:planId/vehicles/:vehicleId", "transport.write"],
  ["GET", "transport-stops", "transport.read"],
  ["POST", "transport-stops", "transport.write"],
  ["PATCH", "transport-stops/:stopId", "transport.write"],
  ["DELETE", "transport-stops/:stopId", "transport.write"],
  ["POST", "transport-plans/:planId/routes", "transport.write"],
  ["PATCH", "transport-plans/:planId/routes/:routeId", "transport.write"],
  ["DELETE", "transport-plans/:planId/routes/:routeId", "transport.write"],
  ["PUT", "transport-plans/:planId/assignments", "transport.assign"],
  ["POST", "transport-plans/:planId/manifests", "transport.export"],
  ["GET", "accommodation-requests", "accommodation.read"],
  ["PATCH", "accommodation-requests/:requestId", "accommodation.write"],
  ["GET", "accommodation-properties", "accommodation.read"],
  ["POST", "accommodation-properties", "accommodation.write"],
  ["GET", "accommodation-properties/:propertyId", "accommodation.read"],
  ["PATCH", "accommodation-properties/:propertyId", "accommodation.write"],
  ["DELETE", "accommodation-properties/:propertyId", "accommodation.write"],
  ["POST", "accommodation-properties/:propertyId/rooms", "accommodation.write"],
  [
    "PATCH",
    "accommodation-properties/:propertyId/rooms/:roomId",
    "accommodation.write",
  ],
  [
    "DELETE",
    "accommodation-properties/:propertyId/rooms/:roomId",
    "accommodation.write",
  ],
  ["GET", "accommodation-stays", "accommodation.read"],
  ["POST", "accommodation-stays", "accommodation.write"],
  ["GET", "accommodation-stays/:stayId", "accommodation.read"],
  ["PATCH", "accommodation-stays/:stayId", "accommodation.write"],
  ["DELETE", "accommodation-stays/:stayId", "accommodation.write"],
  ["PUT", "accommodation-stays/:stayId/allocations", "accommodation.assign"],
  ["POST", "accommodation-stays/:stayId/publish", "accommodation.publish"],
  ["POST", "accommodation-stays/:stayId/rooming-lists", "accommodation.export"],
];
const asyncJobs = new Map([
  ["seating-plans/:planId/suggestions", ["seating_suggestion"]],
  ["seating-plans/:planId/exports", ["seating_export"]],
  ["transport-plans/:planId/manifests", ["transport_manifest"]],
  ["accommodation-stays/:stayId/rooming-lists", ["accommodation_rooming_list"]],
]);
const slice4Operations = definitions.map(([method, route, capability]) => {
  const domain = route.startsWith("transport")
    ? "transport"
    : route.startsWith("accommodation")
      ? "accommodation"
      : "seating";
  const mutation = method !== "GET";
  return {
    id: `SLICE4.${method}.${route
      .replaceAll(/[^a-zA-Z0-9]+/g, "_")
      .replaceAll(/^_|_$/g, "")
      .toUpperCase()}`,
    domain,
    method,
    route: `/api/v1/workspaces/:workspaceId/${route}`,
    purpose: `Slice 4 ${domain} canonical operation`,
    request: {
      path: [...route.matchAll(/:[a-zA-Z]+/g)].map((match) => match[0]),
      dto: mutation
        ? `${domain[0].toUpperCase()}${domain.slice(1)}OperationRequest`
        : null,
      headers: mutation && /PATCH|PUT|DELETE/.test(method) ? ["If-Match"] : [],
      idempotencyKey: mutation && ["POST", "PUT"].includes(method),
    },
    response: {
      data: `${domain[0].toUpperCase()}${domain.slice(1)}Resource`,
      meta: ["requestId", "version when mutable"],
    },
    permissions: [capability],
    validation: [
      "shared Zod schema",
      "forced PostgreSQL RLS",
      "workspace resource identity",
    ],
    errors: [
      "VALIDATION_FAILED",
      "FORBIDDEN",
      "NOT_FOUND",
      "VERSION_CONFLICT",
      "PRECONDITION_REQUIRED",
    ],
    idempotency:
      mutation && ["POST", "PUT"].includes(method)
        ? "required and replay-safe"
        : "not applicable",
    concurrency: mutation ? "If-Match or aggregate transaction" : "read-only",
    audit: mutation,
    eventsEmitted: mutation ? [`${domain}.semantic_event.v1`] : [],
    jobsTriggered: asyncJobs.get(route) ?? [],
    currentBackendCoverage: "IMPLEMENTED_SLICE_4",
    implementationStatus: "active",
    handoffStatuses: [
      "IMPLEMENTED",
      "UNIT_TESTED",
      "INTEGRATION_TESTED",
      "E2E_TESTED",
    ],
    testCoverage:
      "Slice 4 unit, PostgreSQL/Redis/BullMQ integration and Playwright E2E",
  };
});
operationsDocument.operations = [
  ...operationsDocument.operations.filter(
    (item) => !String(item.id).startsWith("SLICE4."),
  ),
  ...slice4Operations,
];
operationsDocument.count = operationsDocument.operations.length;
operationsDocument.generatedAt = generatedAt;
operationsDocument.countsByDomain = {
  ...operationsDocument.countsByDomain,
  seating: slice4Operations.filter((item) => item.domain === "seating").length,
  transport: slice4Operations.filter((item) => item.domain === "transport")
    .length,
  accommodation: slice4Operations.filter(
    (item) => item.domain === "accommodation",
  ).length,
};
operationsDocument.slice4Reconciliation = {
  status: "IMPLEMENTED",
  migration: "20260719090000_slice_4_operations",
  guestBootstrapMigration: "20260719093000_slice_4_guest_operations_bootstrap",
  noFalseSuccess: true,
  publicPrivacyContract:
    "guest access grant + SECURITY DEFINER household projection",
};
await writeJson("docs/API_OPERATION_REGISTRY.json", operationsDocument);

const entitiesDocument = await readJson("docs/BACKEND_ENTITY_CATALOG.json");
const entityTables = {
  VenueSpace: "venue_spaces",
  SeatingPlan: "seating_plans",
  SeatingPlanSnapshot: "seating_plan_snapshots",
  SeatingTable: "seating_tables",
  SeatingSeat: "seating_seats",
  GuestSeatingAssignment: "guest_seating_assignments",
  SeatingConstraint: "seating_constraints",
  SeatingIssue: "seating_issues",
  SeatingSuggestionRun: "seating_suggestion_runs",
  SeatingSuggestion: "seating_suggestions",
  SeatingSuggestionAssignment: "seating_suggestion_assignments",
  TransportRequest: "transport_requests",
  TransportPlan: "transport_plans",
  TransportVehicle: "transport_vehicles",
  TransportRoute: "transport_routes",
  TransportStop: "transport_stops",
  TransportRouteStop: "transport_route_stops",
  GuestTransportAssignment: "guest_transport_assignments",
  TransportIssue: "transport_issues",
  AccommodationRequest: "accommodation_requests",
  AccommodationProperty: "accommodation_properties",
  AccommodationRoomType: "accommodation_room_types",
  AccommodationRoom: "accommodation_rooms",
  AccommodationStay: "accommodation_stays",
  AccommodationAllocation: "accommodation_allocations",
  AccommodationIssue: "accommodation_issues",
};
const slice4Entities = Object.entries(entityTables).map(([name, table]) => ({
  name,
  group:
    name.startsWith("Transport") || name === "GuestTransportAssignment"
      ? "Transport"
      : name.startsWith("Accommodation")
        ? "Accommodation"
        : "Seating",
  aggregate: name,
  storageKind: /Plan$|Stay$|VenueSpace$|Property$/.test(name)
    ? "aggregate_root"
    : "aggregate_member",
  persistent: true,
  whyPersistent: `Canonical Slice 4 state for ${name}.`,
  commonFields: [
    "id: uuid",
    "workspace_id: uuid",
    "created_at: timestamptz",
    "updated_at where mutable",
    "version where mutable",
  ],
  fieldsDefinition:
    "See Prisma schema, ADR 0017-0020 and SLICE_4_IMPLEMENTATION_PLAN.md.",
  relationships: [
    "Workspace",
    "Guest/Event or parent aggregate where applicable",
  ],
  tenantScope: "wedding_workspace",
  lifecycle:
    "Optimistic versioning, semantic events, soft archive where applicable and forced RLS.",
  statuses: ["domain-specific closed enum"],
  indexes: [
    "PRIMARY KEY (id)",
    "workspace aggregate indexes",
    "dedupe/active uniqueness where applicable",
  ],
  piiClassification: /Request|Assignment|Allocation/.test(name)
    ? "guest_personal_or_sensitive"
    : "business_internal",
  retention:
    "workspace lifecycle; published snapshots and audit history retained",
  currentImplementationStatus: "IMPLEMENTED_SLICE_4_MIGRATED_FORCED_RLS",
  migrations: ["20260719090000_slice_4_operations"],
  table,
  testCoverage: ["unit", "integration", "E2E", "cross-workspace RLS"],
}));
entitiesDocument.entities = [
  ...entitiesDocument.entities.filter(
    (item) => !Object.hasOwn(entityTables, item.name),
  ),
  ...slice4Entities,
];
entitiesDocument.slice4ImplementedEntities = Object.keys(entityTables);
entitiesDocument.generatedAt = generatedAt;
entitiesDocument.counts = {
  ...entitiesDocument.counts,
  total: entitiesDocument.entities.length,
  slice4Implemented: slice4Entities.length,
};
await writeJson("docs/BACKEND_ENTITY_CATALOG.json", entitiesDocument);

const automationDocument = await readJson("docs/AUTOMATION_REGISTRY.json");
const automations = [
  [
    "seating.suggestion_requested.v1",
    ["seating_suggestion", "activity_projection"],
  ],
  [
    "seating.assignment_changed.v1",
    ["seating_issue_projection", "activity_projection"],
  ],
  ["seating.export_requested.v1", ["seating_export"]],
  [
    "transport.assignment_changed.v1",
    ["transport_issue_projection", "activity_projection"],
  ],
  ["transport.manifest_requested.v1", ["transport_manifest"]],
  [
    "accommodation.allocation_changed.v1",
    ["accommodation_issue_projection", "activity_projection"],
  ],
  ["accommodation.rooming_list_requested.v1", ["accommodation_rooming_list"]],
  [
    "rsvp.submitted.v1",
    ["rsvp_projection", "guest_operations_projection", "activity_projection"],
  ],
  [
    "rsvp.updated.v1",
    ["rsvp_projection", "guest_operations_projection", "activity_projection"],
  ],
];
const slice4Automations = automations.map(([event, consumers], index) => ({
  id: `AUTO-S4-${String(index + 1).padStart(2, "0")}`,
  sourceEvent: event,
  producer: "Slice 4 API transaction or guest RSVP transaction",
  consumers,
  synchronousEffects: [
    "authoritative state and durable outbox intent commit atomically",
  ],
  asynchronousEffects: consumers.map(
    (consumer) => `${consumer} idempotent effect`,
  ),
  idempotencyKey:
    "outbox message id + consumer name with durable OutboxConsumerExecution dedupe",
  retryPolicy:
    "at-least-once bounded retry; independently recoverable consumer execution",
  notifications: event.includes("published")
    ? ["household-scoped publication"]
    : [],
  audit: true,
  confirmation:
    "domain command validation and If-Match/Idempotency-Key where required",
  failureHandling:
    "authoritative state remains committed; retry/dead-letter remains visible",
  currentBackendCoverage: "IMPLEMENTED_SLICE_4_INTEGRATION_AND_E2E_TESTED",
  evidence: "Slice 4 worker, outbox consumer tests and Playwright scenarios",
}));
automationDocument.automations = [
  ...automationDocument.automations.filter(
    (item) => !String(item.id).startsWith("AUTO-S4-"),
  ),
  ...slice4Automations,
];
automationDocument.count = automationDocument.automations.length;
automationDocument.generatedAt = generatedAt;
automationDocument.slice4Reconciliation = {
  status: "IMPLEMENTED",
  guarantee: "at-least-once with idempotent effects",
  consumers: [...new Set(slice4Automations.flatMap((item) => item.consumers))],
};
await writeJson("docs/AUTOMATION_REGISTRY.json", automationDocument);

const frontendDocument = await readJson("docs/FRONTEND_INVENTORY.json");
for (const route of frontendDocument.routes.filter((item) =>
  [
    "/seating",
    "/transport",
    "/accommodation",
    "/overview",
    "/guest",
    "/guests",
  ].includes(item.route),
)) {
  route.backendLinkedDeclarations = route.actionControlDeclarations;
  route.slice4Status = "API_CONNECTED_NO_MOCK_PRODUCTION";
}
const controlSeeds = [
  ["/seating", "Creează plan", "SLICE4.POST.SEATING_PLANS"],
  ["/seating", "Adaugă masă", "SLICE4.POST.SEATING_PLANS_PLANID_TABLES"],
  [
    "/seating",
    "Drag guest to table",
    "SLICE4.PUT.SEATING_PLANS_PLANID_ASSIGNMENTS",
  ],
  ["/seating", "Propunere", "SLICE4.POST.SEATING_PLANS_PLANID_SUGGESTIONS"],
  ["/seating", "Publică", "SLICE4.POST.SEATING_PLANS_PLANID_PUBLISH"],
  ["/seating", "Export SVG", "SLICE4.POST.SEATING_PLANS_PLANID_EXPORTS"],
  ["/transport", "Vehicul", "SLICE4.POST.TRANSPORT_PLANS_PLANID_VEHICLES"],
  ["/transport", "Rută", "SLICE4.POST.TRANSPORT_PLANS_PLANID_ROUTES"],
  [
    "/transport",
    "Alocă pe rută",
    "SLICE4.PUT.TRANSPORT_PLANS_PLANID_ASSIGNMENTS",
  ],
  ["/transport", "Manifest", "SLICE4.POST.TRANSPORT_PLANS_PLANID_MANIFESTS"],
  ["/transport", "Publică", "SLICE4.POST.TRANSPORT_PLANS_PLANID_PUBLISH"],
  ["/accommodation", "Proprietate", "SLICE4.POST.ACCOMMODATION_PROPERTIES"],
  [
    "/accommodation",
    "Cameră",
    "SLICE4.POST.ACCOMMODATION_PROPERTIES_PROPERTYID_ROOMS",
  ],
  ["/accommodation", "Sejur", "SLICE4.POST.ACCOMMODATION_STAYS"],
  [
    "/accommodation",
    "Alocă în cameră",
    "SLICE4.PUT.ACCOMMODATION_STAYS_STAYID_ALLOCATIONS",
  ],
  [
    "/accommodation",
    "Rooming list",
    "SLICE4.POST.ACCOMMODATION_STAYS_STAYID_ROOMING_LISTS",
  ],
  [
    "/accommodation",
    "Publică",
    "SLICE4.POST.ACCOMMODATION_STAYS_STAYID_PUBLISH",
  ],
  ["/overview", "Operațiuni invitați", "DASHBOARD.GET"],
  ["/guest", "Detaliile familiei tale", "GUEST.BOOTSTRAP"],
  ["shared", "Quick Create masă/rută/proprietate", "SLICE4.QUICK_CREATE"],
];
const firstId =
  Math.max(
    ...frontendDocument.controls.map(
      (item) => Number(String(item.id).replace("UI-", "")) || 0,
    ),
  ) + 1;
const slice4Controls = controlSeeds.map(([route, label, operation], index) => ({
  id: `UI-${String(firstId + index).padStart(4, "0")}`,
  route,
  component: "Slice4ConnectedControl",
  source: {
    file:
      route === "shared"
        ? "src/components/shell/quick-create.tsx"
        : route === "/guest"
          ? "src/app/guest/page.tsx"
          : `src/app/(app)${route}/page.tsx`,
    line: 1,
  },
  controlLabel: label,
  controlType: "button_or_resource_control",
  currentBehavior: "real_api_persistent",
  currentBehaviorEvidence:
    "weddingOsApi typed operation with loading/error/conflict handling",
  expectedDomainAction: label,
  payload: {
    path: ["workspaceId", "aggregateId when applicable"],
    body: ["typed Slice 4 DTO"],
  },
  result: {
    data: "canonical resource or BackgroundJob",
    meta: ["requestId", "version"],
  },
  permissions: ["atomic Slice 4 capability"],
  confirmation: label === "Publică" ? "required" : "domain dependent",
  destructive: false,
  asyncRequirement: /Propunere|Export|Manifest|Rooming/.test(label)
    ? ["BackgroundJob"]
    : [],
  backendOperationId: operation,
  currentBackendCoverage: "IMPLEMENTED_SLICE_4",
  handoffStatuses: ["IMPLEMENTED", "E2E_TESTED"],
}));
frontendDocument.controls = [
  ...frontendDocument.controls.filter(
    (item) => item.currentBackendCoverage !== "IMPLEMENTED_SLICE_4",
  ),
  ...slice4Controls,
];
frontendDocument.generatedAt = generatedAt;
frontendDocument.counts = {
  ...frontendDocument.counts,
  controls: frontendDocument.controls.length,
  slice4ConnectedControls: slice4Controls.length,
};
frontendDocument.slice4Reconciliation = {
  designPreserved: true,
  productionMocksRemoved: ["/seating", "/transport", "/accommodation"],
  guestCompanionPublishedOnly: true,
};
await writeJson("docs/FRONTEND_INVENTORY.json", frontendDocument);

const matrixPath = "docs/PERMISSION_MATRIX.csv";
let matrix = await readFile(matrixPath, "utf8");
const replacements = new Map([
  [
    "Overview,",
    'Overview,IMPLEMENTED,planning.read,none,none,none,none,none,none,none,redacted planning and operations activity only,none,none,IMPLEMENTED_SLICE_4; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED,"Canonical dashboard read model includes real planning, guest, seating, transport and accommodation metrics with rule-based next action."',
  ],
  [
    "Seating,",
    'Seating,IMPLEMENTED,seating.read,seating.write,seating.write,seating.write,seating.publish,seating.assign,seating.export,none,"seating.read_sensitive_summary for protected catering details",GeneratedArtifact only,capability + forced RLS,IMPLEMENTED_SLICE_4; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED,"Draft/review/publish workflow; deterministic suggestions never auto-apply; Guest Companion sees own household only."',
  ],
  [
    "Transport,",
    'Transport,IMPLEMENTED,transport.read,transport.write,transport.write,transport.write,transport.publish,transport.assign,transport.export,none,"transport.read_sensitive for protected contacts",GeneratedArtifact only,capability + forced RLS,IMPLEMENTED_SLICE_4; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED,"RSVP requests remain distinct from assignments; capacity and workspace identity are server-enforced."',
  ],
  [
    "Accommodation,",
    'Accommodation,IMPLEMENTED,accommodation.read,accommodation.write,accommodation.write,accommodation.write,accommodation.publish,accommodation.assign,accommodation.export,none,"accommodation.read_sensitive for protected contacts and notes",GeneratedArtifact only,capability + forced RLS,IMPLEMENTED_SLICE_4; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED,"Requests, inventory and allocations are separate; adult/child capacity and overlapping stays are validated."',
  ],
  [
    "Guest Companion,",
    'Guest Companion,IMPLEMENTED,"guest access grant household scope",guest,"guest while deadline and edits permit",-,guest,-,guest,none,"opaque token; own household published seating/transport/accommodation only",none,none,IMPLEMENTED_SLICE_4; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED,"SECURITY DEFINER bootstrap validates token and returns only published assignments belonging to the current household."',
  ],
]);
matrix = matrix
  .split("\n")
  .map((line) => {
    for (const [prefix, replacement] of replacements)
      if (line.startsWith(prefix)) return replacement;
    return line;
  })
  .join("\n");
await writeFile(matrixPath, matrix, "utf8");
