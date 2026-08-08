import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

await reconcileFrontendInventory();
await reconcileEntityCatalog();
await reconcilePermissionMatrix();

async function reconcileFrontendInventory() {
  const path = new URL("docs/FRONTEND_INVENTORY.json", root);
  const inventory = JSON.parse(await readFile(path, "utf8"));
  inventory.schemaVersion = "2.1.0";
  inventory.generatedAt = "2026-07-18";
  inventory.repositoryReconciliation = {
    ...inventory.repositoryReconciliation,
    repositoryRoot: ".",
    applicationRoot: ".",
    packageManifests: [
      "package.json",
      "apps/api/package.json",
      "packages/config/package.json",
      "packages/contracts/package.json",
      "packages/database/package.json",
    ],
    projectStructure:
      "pnpm workspace; Next.js frontend remains in root; NestJS API is in apps/api; shared packages are in packages/*",
    existingBackendF0F1: true,
    directories: {
      "apps/web": false,
      "apps/api": true,
      "apps/worker": false,
      packages: true,
      database: true,
      migrations: true,
      serverAuth: true,
      domain: true,
      contracts: true,
      integrations: true,
      observability: true,
    },
    frontendImplementations: 1,
    canonicalTypePackages: 1,
    frontendTypeSources: [
      "packages/contracts/src/index.ts",
      "src/lib/types.ts (future product modules only)",
      "page-local TypeScript declarations (future product modules only)",
    ],
    serviceInterfaces: 6,
    serviceImplementations:
      "real Slice 0/1 API client plus mock services retained only for future product modules",
    automatedTestSuites: 3,
    routeSmokeScripts: 1,
    gitHistoryAvailable: false,
  };
  inventory.slice01Handoff = {
    statusVocabulary: [
      "IMPLEMENTED",
      "UNIT_TESTED",
      "INTEGRATION_TESTED",
      "E2E_TESTED",
      "FEATURE_FLAGGED",
      "PLANNED",
    ],
    backendConnectedPages: [
      "/sign-in",
      "/create-account",
      "/verify-email",
      "/forgot-password",
      "/reset-password",
      "/magic-link",
      "/invitation",
      "/onboarding",
      "/team",
      "/settings",
      "protected application shell",
      "workspace switcher",
    ],
    remainingMocksScope:
      "demo repository and future product modules; no production auth, session, workspace, membership, team, profile or preference fallback",
  };

  const implementedControls = new Set([
    "UI-0383",
    "UI-0385",
    "UI-0390",
    "UI-0391",
    "UI-0394",
    "UI-0404",
    "UI-0406",
    "UI-0407",
    "UI-0449",
    "UI-0456",
    "UI-0458",
    "UI-0466",
    "UI-0472",
    "UI-0473",
    "UI-0477",
    "UI-0478",
  ]);
  const plannedControls = new Set(["UI-0384", "UI-0386", "UI-0392"]);
  const uiOnlyControls = new Set([
    "UI-0402",
    "UI-0403",
    "UI-0405",
    "UI-0455",
    "UI-0470",
    "UI-0475",
    "UI-0554",
    "UI-0584",
    "UI-0585",
  ]);
  for (const control of inventory.controls) {
    if (implementedControls.has(control.id)) {
      control.currentBackendCoverage = "IMPLEMENTED";
      control.handoffStatuses = ["IMPLEMENTED"];
      control.currentBehavior = "real_api_call_or_real_api_backed_handler";
    } else if (plannedControls.has(control.id)) {
      control.currentBackendCoverage = "PLANNED";
      control.handoffStatuses = ["PLANNED"];
    } else if (uiOnlyControls.has(control.id)) {
      control.currentBackendCoverage = "NO_BACKEND_CALL_REQUIRED";
      control.handoffStatuses = [];
    }
  }
  await writeFile(path, `${JSON.stringify(inventory, null, 2)}\n`);
}

async function reconcileEntityCatalog() {
  const path = new URL("docs/BACKEND_ENTITY_CATALOG.json", root);
  const catalog = JSON.parse(await readFile(path, "utf8"));
  catalog.schemaVersion = "2.1.0";
  catalog.generatedAt = "2026-07-18";
  catalog.counts.implementedSlice01 = 15;
  catalog.repositoryCoverage =
    "Only the 15 authentication, tenancy and authorization entities below are implemented; the broader target catalog remains planned.";

  const entities = [
    ["User", "users"],
    ["UserProfile", "user_profiles"],
    ["Identity", "identities"],
    ["Session", "sessions"],
    ["AuthOneTimeToken", "auth_one_time_tokens"],
    ["Workspace", "workspaces"],
    ["WeddingProfile", "wedding_profiles"],
    ["WorkspaceMembership", "workspace_memberships"],
    ["RoleTemplate", "role_templates"],
    ["MembershipCapabilityOverride", "membership_capability_overrides"],
    ["TeamInvitation", "team_invitations"],
    ["UserPreference", "user_preferences"],
    ["NotificationPreference", "notification_preferences"],
    ["AuditEvent", "audit_events"],
    ["IdempotencyRecord", "idempotency_records"],
  ];
  const integrationTested = new Set([
    "User",
    "UserProfile",
    "Identity",
    "Session",
    "AuthOneTimeToken",
    "Workspace",
    "WeddingProfile",
    "WorkspaceMembership",
    "RoleTemplate",
    "MembershipCapabilityOverride",
    "TeamInvitation",
    "AuditEvent",
    "IdempotencyRecord",
  ]);
  const e2eTested = new Set([
    "User",
    "UserProfile",
    "Identity",
    "Session",
    "AuthOneTimeToken",
    "Workspace",
    "WeddingProfile",
    "WorkspaceMembership",
    "RoleTemplate",
    "MembershipCapabilityOverride",
    "TeamInvitation",
    "UserPreference",
    "AuditEvent",
    "IdempotencyRecord",
  ]);
  catalog.slice01ImplementedEntities = entities.map(([name, table]) => ({
    name,
    table,
    migration: "20260717224538_slice_0_1_foundation",
    handoffStatuses: [
      "IMPLEMENTED",
      ...(integrationTested.has(name) ? ["INTEGRATION_TESTED"] : []),
      ...(e2eTested.has(name) ? ["E2E_TESTED"] : []),
    ],
  }));

  const conceptualMappings = new Map([
    ["User", "User"],
    ["AuthIdentity", "Identity"],
    ["Session", "Session"],
    ["AuthOneTimeToken", "AuthOneTimeToken"],
    ["WeddingWorkspace", "Workspace"],
    ["WorkspaceMembership", "WorkspaceMembership"],
    ["TeamInvitation", "TeamInvitation"],
    ["UserPreference", "UserPreference"],
    ["NotificationPreference", "NotificationPreference"],
    ["AuditEvent", "AuditEvent"],
    ["IdempotencyKey", "IdempotencyRecord"],
  ]);
  for (const entity of catalog.entities) {
    const implementationName = conceptualMappings.get(entity.name);
    if (!implementationName) continue;
    entity.currentImplementationStatus = "IMPLEMENTED";
    entity.implementationName = implementationName;
    entity.handoffStatuses = catalog.slice01ImplementedEntities.find(
      (implemented) => implemented.name === implementationName,
    )?.handoffStatuses ?? ["IMPLEMENTED"];
  }
  await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

async function reconcilePermissionMatrix() {
  const path = new URL("docs/PERMISSION_MATRIX.csv", root);
  const rows = parseCsv(await readFile(path, "utf8"));
  const header = rows[0];
  const indexes = Object.fromEntries(
    header.map((name, index) => [name, index]),
  );
  const updates = {
    Authentication: [
      "IMPLEMENTED",
      "IMPLEMENTED; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED",
      "Server-side sessions, public auth flows and user-owned session revocation are enforced by NestJS.",
    ],
    Onboarding: [
      "PARTIALLY IMPLEMENTED",
      "IMPLEMENTED workspace creation; E2E_TESTED; PLANNED onboarding draft",
      "Atomic workspace foundation is real; persistent onboarding drafts and generation jobs are planned.",
    ],
    Overview: [
      "PARTIALLY IMPLEMENTED",
      "IMPLEMENTED protected shell and bootstrap; PLANNED dashboard read model",
      "Authentication and workspace bootstrap are real; product dashboard cards still use future-module demo data.",
    ],
    Notifications: [
      "PARTIALLY IMPLEMENTED",
      "IMPLEMENTED preferences; PLANNED notification inbox",
      "User notification preferences persist; notification generation, list and delivery projections are planned.",
    ],
    "Activity/Audit": [
      "PARTIALLY IMPLEMENTED",
      "IMPLEMENTED append-only audit writes; INTEGRATION_TESTED; PLANNED activity read API",
      "Security/domain audit writes are real and append-only; the user-facing activity feed remains planned.",
    ],
    Workspace: [
      "IMPLEMENTED",
      "IMPLEMENTED; INTEGRATION_TESTED; E2E_TESTED",
      "List, atomic create, bootstrap and optimistic update are protected by session, capability checks and RLS.",
    ],
    Team: [
      "IMPLEMENTED",
      "IMPLEMENTED; UNIT_TESTED; INTEGRATION_TESTED; E2E_TESTED",
      "Membership list, invitation lifecycle, role update and removal are server-authorized and tenant-isolated.",
    ],
    "Settings/Billing": [
      "PARTIALLY IMPLEMENTED",
      "IMPLEMENTED profile preferences and sessions; PLANNED billing",
      "Profile, workspace, appearance, notification preferences and sessions use real APIs; billing remains disabled/planned.",
    ],
  };
  for (const row of rows.slice(1)) {
    const update = updates[row[indexes.module]];
    if (!update) continue;
    row[indexes.classification] = update[0];
    row[indexes.backend_coverage] = update[1];
    row[indexes.notes] = update[2];
  }
  await writeFile(path, `${rows.map(stringifyCsvRow).join("\n")}\n`);
}

function parseCsv(source) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function stringifyCsvRow(row) {
  return row
    .map((value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}
