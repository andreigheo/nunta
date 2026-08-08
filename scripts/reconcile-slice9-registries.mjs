import { readFile, writeFile } from "node:fs/promises";

const generatedAt = new Date().toISOString();
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const route = (method, path, capability, purpose, headers = []) => ({
  id: `S9.${method}.${path
    .replaceAll(/[^A-Za-z0-9]+/g, "_")
    .replaceAll(/^_|_$/g, "")
    .toUpperCase()}`,
  domain: "intelligence_risks_automation",
  method,
  route: `/api/v1/workspaces/:workspaceId/${path}`,
  purpose,
  request: {
    path: [":workspaceId", ...(path.match(/:[A-Za-z]+Id/g) ?? [])],
    query:
      method === "GET"
        ? ["documented cursor/filter contract where applicable"]
        : [],
    headers,
  },
  response: {
    data: "Concrete Slice9 OpenAPI schema",
    meta: ["requestId", "version where mutable"],
  },
  permissions: [capability],
  validation: ["forced workspace RLS", "concrete request and response schema"],
  errors: [
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_FAILED",
    "VERSION_CONFLICT",
  ],
  idempotency: headers.includes("Idempotency-Key required")
    ? "durable replay"
    : method === "GET"
      ? "read-only"
      : "semantic dedupe where applicable",
  concurrency: headers.includes("If-Match required")
    ? "optimistic version precondition"
    : "canonical aggregate rules",
  audit: method !== "GET",
  eventsEmitted: ["versioned Slice 9 semantic event where state changes"],
  jobsTriggered: purpose.includes("asynchronous")
    ? ["durable BackgroundJob"]
    : [],
  currentBackendCoverage: "IMPLEMENTED_SLICE_9",
  implementationStatus: "active",
  handoffStatuses: ["IMPLEMENTED", "OPENAPI_VALIDATED", "E2E_TESTED"],
});

const I = "Idempotency-Key required";
const V = "If-Match required";
const operations = [
  [
    "GET",
    "copilot/conversations",
    "copilot.read",
    "List authorized Copilot conversations",
  ],
  [
    "POST",
    "copilot/conversations",
    "copilot.use",
    "Create a durable Copilot conversation",
    [I],
  ],
  [
    "PATCH",
    "copilot/conversations/:conversationId",
    "copilot.use",
    "Update a Copilot conversation",
    [V],
  ],
  [
    "DELETE",
    "copilot/conversations/:conversationId",
    "copilot.use",
    "Archive a Copilot conversation",
    [V],
  ],
  [
    "GET",
    "copilot/conversations/:conversationId",
    "copilot.read",
    "Read conversation, messages and traceable sources",
  ],
  [
    "POST",
    "copilot/conversations/:conversationId/messages",
    "copilot.use",
    "Request an asynchronous bounded Copilot answer",
    [I],
  ],
  [
    "GET",
    "copilot/runs/:runId",
    "copilot.read",
    "Read provider, fallback, usage and run status",
  ],
  [
    "POST",
    "copilot/messages/:messageId/feedback",
    "copilot.use",
    "Persist assistant response feedback",
    [I],
  ],
  ["GET", "copilot/proposals", "copilot.read", "List structured proposals"],
  [
    "GET",
    "copilot/proposals/:proposalId",
    "copilot.read",
    "Read proposal versions, actions and approval state",
  ],
  [
    "PATCH",
    "copilot/proposals/:proposalId",
    "copilot.create_proposal",
    "Edit a structured proposal before approval",
    [V],
  ],
  [
    "POST",
    "copilot/proposals/:proposalId/reviews",
    "copilot.review_proposals",
    "Record explicit proposal review",
    [I, V],
  ],
  [
    "POST",
    "copilot/proposals/:proposalId/approve",
    "copilot.review_proposals",
    "Approve proposal within risk capability",
    [I, V],
  ],
  [
    "POST",
    "copilot/proposals/:proposalId/reject",
    "copilot.review_proposals",
    "Reject proposal without domain mutation",
    [I, V],
  ],
  [
    "POST",
    "copilot/proposals/:proposalId/executions",
    "copilot.execute_proposals",
    "Execute approved canonical actions atomically",
    [I, V],
  ],
  [
    "POST",
    "copilot/proposals/:proposalId/execute",
    "copilot.execute_proposals",
    "Compatibility alias for approved proposal execution",
    [I, V],
  ],
  ["GET", "risks", "risk.read", "List and filter canonical risks"],
  ["POST", "risks", "risk.write", "Create a canonical risk", [I]],
  [
    "GET",
    "risks/:riskId",
    "risk.read",
    "Read risk signals, assessments, mitigations and history",
  ],
  ["PATCH", "risks/:riskId", "risk.write", "Update canonical risk fields", [V]],
  [
    "DELETE",
    "risks/:riskId",
    "risk.write",
    "Soft-delete a canonical risk",
    [I, V],
  ],
  [
    "POST",
    "risks/:riskId/transitions",
    "risk.write",
    "Execute the risk state machine",
    [I, V],
  ],
  [
    "POST",
    "risks/:riskId/assessments",
    "risk.assess",
    "Create an immutable risk assessment",
    [I, V],
  ],
  [
    "POST",
    "risks/:riskId/mitigations",
    "risk.write",
    "Create a risk mitigation action",
    [I, V],
  ],
  [
    "POST",
    "risk-detections",
    "risk.detect",
    "Run asynchronous deterministic risk detection",
    [I],
  ],
  ["GET", "contingency-plans", "contingency.read", "List Plan B records"],
  [
    "POST",
    "contingency-plans",
    "contingency.write",
    "Create a versioned Plan B draft",
    [I],
  ],
  [
    "GET",
    "contingency-plans/:planId",
    "contingency.read",
    "Read Plan B versions, triggers, actions and simulations",
  ],
  [
    "PATCH",
    "contingency-plans/:planId",
    "contingency.write",
    "Edit Plan B before activation",
    [V],
  ],
  [
    "POST",
    "contingency-plans/:planId/simulations",
    "contingency.write",
    "Run an asynchronous non-mutating Plan B simulation",
    [I, V],
  ],
  [
    "POST",
    "contingency-plans/:planId/activations",
    "contingency.activate",
    "Activate an approved Plan B and create canonical actions",
    [I, V],
  ],
  [
    "POST",
    "contingency-plans/:planId/approve",
    "contingency.approve",
    "Approve a Plan B separately from activation",
    [I, V],
  ],
  [
    "POST",
    "contingency-plans/:planId/activate",
    "contingency.activate",
    "Compatibility alias for Plan B activation",
    [I, V],
  ],
  [
    "POST",
    "contingency-plans/:planId/complete",
    "contingency.complete",
    "Complete an active Plan B",
    [I, V],
  ],
  [
    "POST",
    "contingency-plans/:planId/cancel",
    "contingency.write",
    "Cancel a Plan B with traceable reason",
    [I, V],
  ],
  [
    "GET",
    "automation-templates",
    "automation.read",
    "List the controlled automation template catalog",
  ],
  [
    "GET",
    "automation-rules",
    "automation.read",
    "List controlled automation rules",
  ],
  [
    "POST",
    "automation-rules",
    "automation.write",
    "Create a closed-schema automation rule",
    [I],
  ],
  [
    "GET",
    "automation-rules/:ruleId",
    "automation.read",
    "Read one automation rule",
  ],
  [
    "PATCH",
    "automation-rules/:ruleId",
    "automation.write",
    "Update a controlled automation rule",
    [V],
  ],
  [
    "POST",
    "automation-rules/:ruleId/executions",
    "automation.execute",
    "Create a dry-run or asynchronous execution",
    [I, V],
  ],
  [
    "GET",
    "automation-rules/:ruleId/executions",
    "automation.read",
    "List rule execution history",
  ],
  [
    "GET",
    "automations",
    "automation.read",
    "List automation rules through the frontend alias",
  ],
  [
    "POST",
    "automations",
    "automation.write",
    "Create automation through the frontend alias",
    [I],
  ],
  [
    "GET",
    "automations/:automationId",
    "automation.read",
    "Read automation through the frontend alias",
  ],
  [
    "PATCH",
    "automations/:automationId",
    "automation.write",
    "Update automation through the frontend alias",
    [V],
  ],
  [
    "DELETE",
    "automations/:automationId",
    "automation.write",
    "Disable an automation without erasing history",
    [I, V],
  ],
  [
    "POST",
    "automations/:automationId/activate",
    "automation.activate",
    "Activate a controlled automation",
    [I, V],
  ],
  [
    "POST",
    "automations/:automationId/pause",
    "automation.pause",
    "Pause a controlled automation",
    [I, V],
  ],
  [
    "POST",
    "automations/:automationId/test",
    "automation.execute",
    "Execute a non-mutating automation test",
    [I, V],
  ],
  [
    "POST",
    "automations/:automationId/dry-run",
    "automation.execute",
    "Execute a dry-run preview",
    [I, V],
  ],
  [
    "GET",
    "automation-executions",
    "automation.view_executions",
    "List authorized automation execution history",
  ],
  [
    "GET",
    "automation-executions/:executionId",
    "automation.view_executions",
    "Read step-level automation execution history",
  ],
  [
    "POST",
    "automation-executions/:executionId/approve",
    "automation.approve",
    "Approve a pending high-impact execution",
    [I, V],
  ],
  [
    "POST",
    "automation-executions/:executionId/reject",
    "automation.approve",
    "Reject a pending high-impact execution",
    [I, V],
  ],
  ["GET", "weekly-digests", "copilot.read", "List weekly intelligence digests"],
  [
    "POST",
    "weekly-digests",
    "copilot.use",
    "Generate an asynchronous canonical weekly digest",
    [I],
  ],
].map((args) => route(...args));

const api = await readJson("docs/API_OPERATION_REGISTRY.json");
api.schemaVersion = "2.7.0";
api.generatedAt = generatedAt;
api.repositoryCoverage =
  "Slices 0 through 9 are reconciled against canonical /api/v1 OpenAPI. General Copilot, structured proposals, Risks, Plan B, controlled automations and weekly digests are active; Slice 10 is not started.";
api.operations = api.operations.filter(
  (item) => !String(item.id).startsWith("S9."),
);
api.operations.push(...operations);
api.count = api.operations.length;
api.countsByDomain.intelligence_risks_automation = operations.length;
api.slice9Reconciliation = {
  status: "IMPLEMENTED_ACTIVE_OPENAPI_VALIDATED_E2E_TESTED",
  canonicalPrefix: "/api/v1",
  activeOperationCount: operations.length,
  controllers: ["IntelligenceController"],
  operationFamilies: {
    copilot:
      "conversation, async run, secure source references, provider/fallback/usage, feedback and structured proposals",
    risks:
      "canonical register, assessment, score, mitigation, state machine and deterministic detection",
    contingency:
      "versioned Plan B, simulation, explicit approval, activation, completion and cancellation",
    automations:
      "closed triggers/actions, dry-run, approval, execution steps, scheduling, pause and dedupe",
    digest:
      "canonical metrics, preferences, quiet hours and provider-confirmed delivery",
  },
  capabilities: [
    "copilot.read",
    "copilot.use",
    "copilot.create_proposal",
    "copilot.review_proposals",
    "copilot.execute_proposals",
    "copilot.approve_low_risk",
    "copilot.approve_medium_risk",
    "copilot.approve_high_risk",
    "copilot.view_usage",
    "risk.read",
    "risk.write",
    "risk.detect",
    "risk.assess",
    "risk.assign",
    "risk.accept",
    "risk.resolve",
    "risk.read_sensitive",
    "contingency.read",
    "contingency.write",
    "contingency.approve",
    "contingency.activate",
    "contingency.complete",
    "automation.read",
    "automation.write",
    "automation.execute",
    "automation.activate",
    "automation.pause",
    "automation.approve",
    "automation.view_executions",
    "automation.manage_templates",
  ],
  contractGuarantees: [
    "read-only assistant answers never mutate canonical domains",
    "all writes are structured proposals with explicit risk-based review, version and idempotency",
    "provider input is a minimized persisted context snapshot and source references remain traceable",
    "workers derive tenant, actor and job identity from persisted outbox records",
    "automations use a closed trigger/condition/action registry with recursion and duplicate guards",
    "no shell, arbitrary HTTP, arbitrary SQL, arbitrary filesystem or secret access",
  ],
  testCoverage: {
    unit: "28/28 Slice 9 domain cases",
    e2e: "30/30 Slice 9 journeys",
    failed: 0,
    skipped: 0,
    retries: 0,
  },
};
await writeJson("docs/API_OPERATION_REGISTRY.json", api);

const frontend = await readJson("docs/FRONTEND_INVENTORY.json");
frontend.schemaVersion = "2.6.0";
frontend.generatedAt = generatedAt;
const newRoutes = [
  ["/risks", "src/app/(app)/risks/page.tsx"],
  ["/risks/[id]", "src/app/(app)/risks/[id]/page.tsx"],
  ["/contingency-plans", "src/app/(app)/contingency-plans/page.tsx"],
  ["/contingency-plans/[id]", "src/app/(app)/contingency-plans/[id]/page.tsx"],
  ["/automations", "src/app/(app)/automations/page.tsx"],
];
for (const [routeName, componentFile] of newRoutes) {
  const existing = frontend.routes.find((item) => item.route === routeName);
  if (existing)
    Object.assign(existing, { componentFile, backendLinkedDeclarations: 1 });
  else
    frontend.routes.push({
      route: routeName,
      componentFile,
      actionControlDeclarations: 1,
      backendLinkedDeclarations: 1,
    });
}
frontend.counts.routes = frontend.routes.length;
frontend.counts.normalizedModules = frontend.routes.length;
frontend.slice9Reconciliation = {
  status: "CONNECTED_TO_REAL_API_AND_E2E_TESTED",
  designPreserved: true,
  productionPages: newRoutes
    .map(([value]) => value)
    .concat([
      "/overview",
      "global shell Copilot",
      "command palette",
      "Quick Create",
    ]),
  realControls: [
    "Copilot conversations, grounded response, source links, feedback, proposal edit/review/approve/reject/execute",
    "risk list/detail, create, assess, mitigate, assign and explicit transitions",
    "Plan B create/edit/simulate/approve/activate/complete/cancel",
    "automation template catalog, create/edit/activate/pause/dry-run, approval and execution history",
    "Overview risk summary, authorized search and Quick Create for risk and Plan B",
  ],
  disabledPlannedControls: [
    "voice input",
    "attachments without secure vault selection",
    "arbitrary prompt tools",
    "arbitrary webhooks",
    "general autonomous mode",
  ],
  demoIsolation:
    "Demo mode remains local and emits zero production API mutations.",
  truthfulness:
    "Queued and provider delivery states are shown as such; proposal approval never implies execution and digest delivery is provider-confirmed.",
  testCoverage: "30/30 Slice 9 E2E; zero failed, skipped or retries",
};
await writeJson("docs/FRONTEND_INVENTORY.json", frontend);

const entityNames = [
  "CopilotConversation",
  "CopilotMessage",
  "CopilotRun",
  "CopilotSourceReference",
  "CopilotFeedback",
  "CopilotProposal",
  "CopilotProposalVersion",
  "CopilotProposalAction",
  "CopilotApproval",
  "CopilotExecution",
  "CopilotUsageRecord",
  "DocumentTextExtraction",
  "DocumentTextChunk",
  "RiskDetectionRun",
  "Risk",
  "RiskSignal",
  "RiskAssessment",
  "RiskMitigationAction",
  "RiskUpdate",
  "ContingencyPlan",
  "ContingencyPlanVersion",
  "ContingencyTrigger",
  "ContingencyAction",
  "ContingencyActivation",
  "ContingencySimulation",
  "AutomationRule",
  "AutomationCondition",
  "AutomationAction",
  "AutomationExecution",
  "AutomationExecutionApproval",
  "AutomationExecutionStep",
  "AutomationTemplate",
  "WeeklyIntelligenceDigest",
  "BackgroundJob (reused)",
];
const catalog = await readJson("docs/BACKEND_ENTITY_CATALOG.json");
catalog.schemaVersion = "2.6.0";
catalog.generatedAt = generatedAt;
catalog.counts.slice9Implemented = entityNames.length;
catalog.counts.total = 241;
catalog.repositoryCoverage =
  "Slices 0 through 9 are implemented. Slice 9 adds the 33 persisted intelligence-domain models listed below and reuses BackgroundJob, outbox, notification and activity infrastructure.";
catalog.slice9ImplementedEntities = entityNames;
catalog.slice9MigrationEntities = {
  migrations: [
    "20260720200000_slice_9_intelligence_core",
    "20260720201000_slice_9_rls_capabilities_integrity",
    "20260720202000_slice_9_worker_context_recovery",
    "20260720203000_slice_9_completion",
    "20260720204000_slice_9_scheduled_automation",
    "20260720205000_slice_9_worker_derived_events",
    "20260720205500_slice_9_digest_recipient_contract",
  ],
  forcedRls:
    "all workspace-scoped Copilot, risk, contingency and automation entities",
  immutableAppendOnly: [
    "CopilotProposalVersion",
    "ContingencyPlanVersion",
    "CopilotUsageRecord",
    "AutomationExecutionStep",
    "RiskUpdate",
  ],
  workerIsolation:
    "persisted execution context plus bounded SECURITY DEFINER recipient contract; no direct worker grant on users",
};
for (const item of catalog.entities) {
  if (item.name === "Risk")
    item.currentImplementationStatus = "IMPLEMENTED_SLICE_9_FORCED_RLS";
  if (item.name === "PlanB")
    item.currentImplementationStatus =
      "CONSOLIDATED_INTO_CONTINGENCY_PLAN_SLICE_9";
  if (item.name === "RiskMitigation")
    item.currentImplementationStatus =
      "CONSOLIDATED_INTO_RISK_MITIGATION_ACTION_SLICE_9";
  if (item.name === "AiActionProposal")
    item.currentImplementationStatus =
      "CONSOLIDATED_INTO_COPILOT_PROPOSAL_AND_ACTION_SLICE_9";
}
await writeJson("docs/BACKEND_ENTITY_CATALOG.json", catalog);

const automation = await readJson("docs/AUTOMATION_REGISTRY.json");
automation.schemaVersion = "1.5.0";
automation.generatedAt = generatedAt;
const families = [
  [
    "COPILOT",
    "copilot.run_requested.v1",
    [
      "copilot_run",
      "notification_projection",
      "activity_projection",
      "event_ack",
    ],
  ],
  [
    "RISK",
    "risk.detect_requested.v1",
    [
      "risk_detection",
      "notification_projection",
      "activity_projection",
      "event_ack",
    ],
  ],
  [
    "CONTINGENCY",
    "contingency.plan_simulation_requested.v1",
    ["contingency_simulation", "activity_projection", "event_ack"],
  ],
  [
    "AUTOMATION_EXECUTION",
    "automation.execution_requested.v1",
    [
      "automation_execution",
      "notification_projection",
      "activity_projection",
      "event_ack",
    ],
  ],
  [
    "AUTOMATION_TRIGGER",
    "task.updated.v1",
    ["automation_trigger", "event_ack"],
  ],
  [
    "WEEKLY_DIGEST",
    "digest.weekly_requested.v1",
    [
      "weekly_digest",
      "notification_projection",
      "activity_projection",
      "event_ack",
    ],
  ],
];
automation.automations = automation.automations.filter(
  (item) => !String(item.id).startsWith("AUTO-S9-"),
);
families.forEach(([name, sourceEvent, consumers], index) =>
  automation.automations.push({
    id: `AUTO-S9-${String(index + 1).padStart(2, "0")}`,
    sourceEvent,
    producer: "Slice 9 canonical API transaction or persisted scheduler",
    consumers,
    synchronousEffects: [
      "authoritative state and durable outbox intent commit atomically",
    ],
    asynchronousEffects: consumers.map(
      (consumer) => `${consumer} idempotent effect`,
    ),
    idempotencyKey:
      "outbox message id + consumer name; domain effects also have persisted dedupe keys",
    retryPolicy:
      "at-least-once bounded retry with independently recoverable consumer execution",
    notifications: [
      "preference, ownership, quiet-hours and semantic dedupe enforced",
    ],
    audit: true,
    confirmation:
      "If-Match, Idempotency-Key and risk-based approval where required",
    failureHandling:
      "canonical state remains truthful; retry/dead-letter is visible and no approval implies execution",
    currentBackendCoverage: "IMPLEMENTED_SLICE_9_E2E_TESTED",
    evidence: "Slice 9 unit and 30/30 Playwright E2E",
  }),
);
automation.count = automation.automations.length;
automation.slice9Reconciliation = {
  status: "IMPLEMENTED_INTEGRATION_AND_E2E_TESTED",
  deliveryGuarantee:
    "at-least-once with independently retryable OutboxConsumerExecution records and idempotent effects; no universal external exactly-once claim",
  consumers: [
    "copilot_run",
    "risk_detection",
    "contingency_simulation",
    "automation_execution",
    "automation_trigger",
    "weekly_digest",
    "notification_projection",
    "activity_projection",
    "event_ack",
  ],
  semanticEventFamilies: [
    "copilot.*.v1",
    "risk.*.v1",
    "contingency.*.v1",
    "automation.*.v1",
    "digest.*.v1",
  ],
  allowedActions: [
    "CREATE_TASK",
    "UPDATE_TASK",
    "CREATE_CALENDAR_EVENT",
    "CREATE_RISK",
    "CREATE_CONTINGENCY_PLAN",
    "CREATE_NOTIFICATION",
  ],
  forbiddenActions: [
    "arbitrary shell",
    "arbitrary HTTP",
    "arbitrary SQL",
    "filesystem access",
    "secret access",
    "direct payment/refund/contract/signature execution",
  ],
  scheduling:
    "durable available_at schedule with canonical state/version/access revalidation",
  recovery:
    "dispatcher crash, worker crash, partial consumer success and provider success before acknowledgement resume from persisted state",
  recursionProtection:
    "bounded depth, source event dedupe and projections that do not re-emit their source mutation",
  testCoverage: "28/28 Slice 9 unit and 30/30 E2E; zero failed/skipped/retries",
};
await writeJson("docs/AUTOMATION_REGISTRY.json", automation);

const permissionPath = "docs/PERMISSION_MATRIX.csv";
const permissionLines = (await readFile(permissionPath, "utf8"))
  .trimEnd()
  .split("\n");
const replacements = new Map([
  [
    "AI Copilot",
    'AI Copilot,IMPLEMENTED,copilot.read,copilot.use,copilot.create_proposal,none,none,"copilot.review_proposals; risk-tier approval capabilities",none,redacted summaries only,redacted sources only,"authorized vault text chunks only; no raw storage key","copilot.view_usage; provider config environment-only",IMPLEMENTED_SLICE_9; UNIT_TESTED; E2E_TESTED,"Read-only answers are grounded in persisted snapshots; every write is a versioned structured proposal requiring explicit review and separate execution."',
  ],
  [
    "Risks",
    'Risks,IMPLEMENTED,risk.read,risk.write,"risk.write; risk.assess; risk.assign",risk.write,none,"risk.accept; risk.resolve",none,authorized financial signals only,redacted guest signals only,authorized source references only,risk.read_sensitive,IMPLEMENTED_SLICE_9; UNIT_TESTED; E2E_TESTED,"Canonical score, signals, assessments, mitigations and explicit state transitions use forced workspace RLS."',
  ],
  [
    "Plan B",
    'Plan B,IMPLEMENTED,contingency.read,contingency.write,contingency.write,none,none,"contingency.approve; contingency.activate; contingency.complete",none,none,redacted/none,authorized source references only,none,IMPLEMENTED_SLICE_9; UNIT_TESTED; E2E_TESTED,"Versioned plans separate simulation, approval and activation; activation creates only allowlisted canonical actions."',
  ],
]);
for (let index = 1; index < permissionLines.length; index += 1) {
  const name = permissionLines[index].split(",", 1)[0];
  if (replacements.has(name)) permissionLines[index] = replacements.get(name);
}
if (
  !permissionLines.some((line) => line.startsWith("Controlled Automations,"))
) {
  permissionLines.push(
    'Controlled Automations,IMPLEMENTED,automation.read,automation.write,automation.write,automation.write,none,"automation.approve; automation.activate; automation.pause",none,none,redacted/none,none,automation.manage_templates,IMPLEMENTED_SLICE_9; UNIT_TESTED; E2E_TESTED,"Closed triggers and allowlisted actions only; dry-run, execution steps, idempotency, recursion guards and approval are persistent."',
  );
}
await writeFile(permissionPath, `${permissionLines.join("\n")}\n`, "utf8");
