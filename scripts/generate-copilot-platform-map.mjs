import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const generatedAt = "generated-from-source";

const pageRoot = path.join(root, "src", "app");
const controllerRoot = path.join(root, "apps", "api", "src");
const tsOutput = path.join(
  root,
  "packages",
  "jobs",
  "src",
  "generated",
  "copilot-platform-map.ts",
);
const docsOutput = path.join(root, "docs", "COPILOT_PLATFORM_MAP.md");

const highRiskPattern =
  /(?:send|publish|unpublish|archive|delete|remove|transition|activate|execute|refund|payout|signature|checkout|suspend|restore|revoke|export)/i;
const blockedPattern =
  /(?:payment-refunds|payout|signature-envelopes|mfa|sessions|password|deletion-requests|legal-holds)/i;

const activeAdapters = new Map(
  [
    ["post:/api/v1/workspaces/:workspaceId/tasks", "CREATE_TASK"],
    ["patch:/api/v1/workspaces/:workspaceId/tasks/:taskId", "UPDATE_TASK"],
    [
      "post:/api/v1/workspaces/:workspaceId/calendar-events",
      "CREATE_CALENDAR_EVENT",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/calendar-events/:eventId",
      "UPDATE_CALENDAR_EVENT",
    ],
    ["post:/api/v1/workspaces/:workspaceId/risks", "CREATE_RISK"],
    ["patch:/api/v1/workspaces/:workspaceId/risks/:riskId", "UPDATE_RISK"],
    [
      "post:/api/v1/workspaces/:workspaceId/contingency-plans",
      "CREATE_CONTINGENCY_PLAN",
    ],
    ["put:/api/v1/workspaces/:workspaceId/budget", "UPSERT_BUDGET_PLAN"],
    [
      "post:/api/v1/workspaces/:workspaceId/budget/categories",
      "CREATE_BUDGET_CATEGORY",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/budget/categories/:categoryId",
      "UPDATE_BUDGET_CATEGORY",
    ],
    ["post:/api/v1/workspaces/:workspaceId/budget/items", "CREATE_BUDGET_ITEM"],
    [
      "patch:/api/v1/workspaces/:workspaceId/budget/items/:itemId",
      "UPDATE_BUDGET_ITEM",
    ],
    ["post:/api/v1/workspaces/:workspaceId/expenses", "CREATE_EXPENSE"],
    [
      "patch:/api/v1/workspaces/:workspaceId/expenses/:expenseId",
      "UPDATE_EXPENSE",
    ],
    ["post:/api/v1/workspaces/:workspaceId/households", "CREATE_HOUSEHOLD"],
    [
      "patch:/api/v1/workspaces/:workspaceId/households/:householdId",
      "UPDATE_HOUSEHOLD",
    ],
    ["post:/api/v1/workspaces/:workspaceId/guests", "CREATE_GUEST"],
    ["patch:/api/v1/workspaces/:workspaceId/guests/:guestId", "UPDATE_GUEST"],
    ["post:/api/v1/workspaces/:workspaceId/menus", "CREATE_MENU"],
    ["patch:/api/v1/workspaces/:workspaceId/menus/:menuId", "UPDATE_MENU"],
    [
      "post:/api/v1/workspaces/:workspaceId/seating-plans",
      "CREATE_SEATING_PLAN",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/seating-plans/:planId",
      "UPDATE_SEATING_PLAN",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/seating-plans/:planId/tables",
      "CREATE_SEATING_TABLE",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/seating-plans/:planId/tables/:tableId",
      "UPDATE_SEATING_TABLE",
    ],
    [
      "put:/api/v1/workspaces/:workspaceId/seating-plans/:planId/assignments",
      "REPLACE_SEATING_ASSIGNMENTS",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/vendor-shortlists",
      "CREATE_VENDOR_SHORTLIST",
    ],
    [
      "put:/api/v1/workspaces/:workspaceId/vendor-shortlists/:shortlistId/vendors/:vendorOrganizationId",
      "ADD_VENDOR_TO_SHORTLIST",
    ],
    [
      "put:/api/v1/workspaces/:workspaceId/vendor-favorites/:vendorOrganizationId",
      "FAVORITE_VENDOR",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/invitation-site/sync-apply",
      "SYNC_INVITATION_DATA",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/transport-plans",
      "CREATE_TRANSPORT_PLAN",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/transport-plans/:planId",
      "UPDATE_TRANSPORT_PLAN",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/transport-stops",
      "CREATE_TRANSPORT_STOP",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/transport-stops/:stopId",
      "UPDATE_TRANSPORT_STOP",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/accommodation-properties",
      "CREATE_ACCOMMODATION_PROPERTY",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/accommodation-properties/:propertyId",
      "UPDATE_ACCOMMODATION_PROPERTY",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/accommodation-stays",
      "CREATE_ACCOMMODATION_STAY",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/accommodation-stays/:stayId",
      "UPDATE_ACCOMMODATION_STAY",
    ],
    ["post:/api/v1/workspaces/:workspaceId/rfqs", "CREATE_RFQ"],
    ["patch:/api/v1/workspaces/:workspaceId/rfqs/:rfqId", "UPDATE_RFQ"],
    ["post:/api/v1/workspaces/:workspaceId/campaigns", "CREATE_CAMPAIGN_DRAFT"],
    [
      "patch:/api/v1/workspaces/:workspaceId/campaigns/:campaignId",
      "UPDATE_CAMPAIGN_DRAFT",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/wedding-day/plans/:planId/incidents",
      "CREATE_WEDDING_DAY_INCIDENT",
    ],
    [
      "post:/api/v1/workspaces/:workspaceId/wedding-day/plans/:planId/announcements",
      "CREATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
    ],
    [
      "patch:/api/v1/workspaces/:workspaceId/wedding-day/announcements/:announcementId",
      "UPDATE_WEDDING_DAY_ANNOUNCEMENT_DRAFT",
    ],
  ].map(([id, actionType]) => [id, { actionType, adapterStatus: "ACTIVE" }]),
);

async function filesBelow(directory, predicate) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory())
      results.push(...(await filesBelow(target, predicate)));
    else if (predicate(target)) results.push(target);
  }
  return results;
}

function normalizeRoute(value) {
  const route = value
    .replaceAll("\\", "/")
    .replace(/^src\/app\//, "")
    .replace(/\/page\.tsx$/, "")
    .split("/")
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .map((segment) => segment.replace(/^\[(?:\.\.\.)?(.+)\]$/, ":$1"))
    .join("/");
  return `/${route}`.replace(/\/$/, "") || "/";
}

function pagePersona(route) {
  if (route.startsWith("/admin")) return "platform";
  if (route.startsWith("/vendor")) return "vendor";
  if (route === "/guest" || route.startsWith("/guest/")) return "guest";
  if (
    route === "/" ||
    route.startsWith("/sign-") ||
    route.startsWith("/register") ||
    route.startsWith("/verify") ||
    route.startsWith("/forgot") ||
    route.startsWith("/reset") ||
    route.startsWith("/legal")
  )
    return "public";
  if (route.startsWith("/onboarding")) return "onboarding";
  return "organizer";
}

function routeString(argument) {
  if (!argument?.trim()) return "";
  return argument.trim().match(/^["'`]([^"'`]*)["'`]$/)?.[1] ?? "";
}

function joinRoute(prefix, suffix) {
  const route = [prefix, suffix]
    .filter(Boolean)
    .join("/")
    .replace(/\/+/, "/")
    .replace(/^\//, "");
  return `/${route}`.replace(/\/$/, "") || "/";
}

function domainFor(file, route) {
  const relative = path
    .relative(controllerRoot, file)
    .replaceAll("\\", "/")
    .replace(/\.controller\.ts$/, "");
  const segments = route.split("/").filter(Boolean);
  const prefix = segments[2];
  if (prefix === "workspaces" && segments[4]) return segments[4];
  if (prefix === "vendor-organizations" && segments[4])
    return `vendor-${segments[4]}`;
  return prefix || relative.split("/")[0] || "platform";
}

function operationFor(verb, route) {
  if (verb === "GET") return "READ";
  if (blockedPattern.test(route)) return "GUIDE_ONLY";
  return "PROPOSE";
}

function riskFor(verb, route) {
  if (verb === "GET") return "LOW";
  if (blockedPattern.test(route)) return "CRITICAL";
  if (verb === "DELETE" || highRiskPattern.test(route)) return "HIGH";
  if (verb === "PATCH" || verb === "PUT") return "MEDIUM";
  return "MEDIUM";
}

function parseControllerSegment(file, source) {
  const controllerPrefix = routeString(
    source.match(/@Controller\(([^)]*)\)/)?.[1] ?? "",
  );
  const classIndex = source.search(/export\s+class\s+/);
  const classHeader = classIndex >= 0 ? source.slice(0, classIndex) : source;
  const classCapability = [
    ...classHeader.matchAll(/@RequireCapability\("([^"]+)"\)/g),
  ].at(-1)?.[1];
  const matches = [
    ...source.matchAll(/@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/g),
  ];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const verb = match[1].toUpperCase();
    const route = joinRoute(controllerPrefix, routeString(match[2]));
    const capability =
      block.match(/@RequireCapability\("([^"]+)"\)/)?.[1] ??
      classCapability ??
      null;
    const method =
      block.match(/\n\s*(?:async\s+)?([A-Za-z0-9_]+)\s*\(/)?.[1] ?? "unknown";
    const id = `${verb.toLowerCase()}:${route}`;
    const adapter = activeAdapters.get(id);
    return {
      id,
      verb,
      route,
      domain: domainFor(file, route),
      controller: path.relative(root, file).replaceAll("\\", "/"),
      method,
      capability,
      operation: operationFor(verb, route),
      risk: riskFor(verb, route),
      adapterStatus:
        adapter?.adapterStatus ??
        (verb === "GET"
          ? blockedPattern.test(route)
            ? "INTENTIONALLY_UNSUPPORTED"
            : "READ_ONLY"
          : blockedPattern.test(route)
            ? "INTENTIONALLY_UNSUPPORTED"
            : "GUIDE_ONLY"),
      actionType: adapter?.actionType ?? null,
    };
  });
}

function parseController(file, source) {
  const controllers = [...source.matchAll(/@Controller\(([^)]*)\)/g)];
  return controllers.flatMap((controller, index) => {
    const start = controller.index ?? 0;
    const end = controllers[index + 1]?.index ?? source.length;
    return parseControllerSegment(file, source.slice(start, end));
  });
}

function quote(value) {
  return JSON.stringify(value);
}

function renderTypeScript(pages, endpoints) {
  return `/* This file is generated by scripts/generate-copilot-platform-map.mjs. */
export const COPILOT_PLATFORM_MAP_VERSION = ${quote(generatedAt)} as const;

export const copilotPageSurfaces = ${JSON.stringify(pages, null, 2)} as const;

export const copilotApiOperations = ${JSON.stringify(endpoints, null, 2)} as const;

export type CopilotPageSurface = (typeof copilotPageSurfaces)[number];
export type CopilotApiOperation = (typeof copilotApiOperations)[number];
`;
}

function renderDocs(pages, endpoints) {
  const statusCount = (status) =>
    endpoints.filter((item) => item.adapterStatus === status).length;
  const domains = new Map();
  for (const endpoint of endpoints) {
    const current = domains.get(endpoint.domain) ?? {
      routes: 0,
      reads: 0,
      proposals: 0,
      guideOnly: 0,
      capabilities: new Set(),
    };
    current.routes += 1;
    if (endpoint.operation === "READ") current.reads += 1;
    if (endpoint.operation === "PROPOSE") current.proposals += 1;
    if (endpoint.operation === "GUIDE_ONLY") current.guideOnly += 1;
    if (endpoint.capability) current.capabilities.add(endpoint.capability);
    domains.set(endpoint.domain, current);
  }
  const domainRows = [...domains.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([domain, item]) =>
        `| ${domain} | ${item.routes} | ${item.reads} | ${item.proposals} | ${item.guideOnly} | ${[...item.capabilities].sort().join(", ") || "—"} |`,
    )
    .join("\n");
  const pageRows = pages
    .map((page) => `| ${page.route} | ${page.persona} | ${page.status} |`)
    .join("\n");
  return `# Harta platformei pentru Copilot

Acest document este generat din rutele Next.js și controllerele API. Nu edita manual; rulează \`pnpm copilot:map\`.

## Regula de acoperire

O suprafață nu este considerată controlabilă până când operația are adaptor explicit, schemă validată, verificare de capabilitate, politică de aprobare, idempotency, audit și teste. Clasificările sunt exhaustive: \`ACTIVE\`, \`READ_ONLY\`, \`GUIDE_ONLY\` sau \`INTENTIONALLY_UNSUPPORTED\`.

## Rezumat

- Pagini: **${pages.length}**
- Operații API: **${endpoints.length}**
- Domenii API: **${domains.size}**
- Operații executabile prin propunere: **${statusCount("ACTIVE")}**
- Operații disponibile pentru citire contextuală: **${statusCount("READ_ONLY")}**
- Operații explicate, dar neexecutate direct: **${statusCount("GUIDE_ONLY")}**
- Operații excluse intenționat: **${statusCount("INTENTIONALLY_UNSUPPORTED")}**
- Operații neclasificate: **0**
- Operații de citire candidate: **${endpoints.filter((item) => item.operation === "READ").length}**
- Modificări numai prin propunere/aprobare: **${endpoints.filter((item) => item.operation === "PROPOSE").length}**
- Operații doar ghidate, fără execuție directă: **${endpoints.filter((item) => item.operation === "GUIDE_ONLY").length}**

## Domenii API

| Domeniu | Rute | Citire | Propunere | Doar ghidare | Capabilități declarate |
| --- | ---: | ---: | ---: | ---: | --- |
${domainRows}

## Suprafețe UI

| Rută | Persona | Stare adaptor contextual |
| --- | --- | --- |
${pageRows}
`;
}

async function writeOrCheck(file, content) {
  if (checkOnly) {
    const current = await fs.readFile(file, "utf8").catch(() => "");
    if (current !== content) {
      process.stderr.write(
        `Copilot map is stale: ${path.relative(root, file)}\n`,
      );
      process.exitCode = 1;
    }
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

const pageFiles = await filesBelow(pageRoot, (file) =>
  file.endsWith("page.tsx"),
);
const pages = pageFiles
  .map((file) => {
    const route = normalizeRoute(path.relative(root, file));
    return {
      route,
      persona: pagePersona(route),
      source: path.relative(root, file).replaceAll("\\", "/"),
      status:
        pagePersona(route) === "public"
          ? "INTENTIONALLY_UNSUPPORTED"
          : pagePersona(route) === "guest"
            ? "READ_ONLY"
            : "GUIDE_ONLY",
    };
  })
  .sort((left, right) => left.route.localeCompare(right.route));

const controllerFiles = await filesBelow(controllerRoot, (file) =>
  file.endsWith(".controller.ts"),
);
const endpoints = (
  await Promise.all(
    controllerFiles.map(async (file) =>
      parseController(file, await fs.readFile(file, "utf8")),
    ),
  )
)
  .flat()
  .sort((left, right) =>
    `${left.domain}:${left.route}:${left.verb}`.localeCompare(
      `${right.domain}:${right.route}:${right.verb}`,
    ),
  );

await writeOrCheck(tsOutput, renderTypeScript(pages, endpoints));
await writeOrCheck(docsOutput, renderDocs(pages, endpoints));

if (!checkOnly)
  process.stdout.write(
    `Mapped ${pages.length} pages and ${endpoints.length} API operations.\n`,
  );
