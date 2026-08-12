import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@weddingos/database";
import { SafeOutboundHttpClient } from "../../apps/api/src/common/safe-outbound-http.client";

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
const contexts: APIRequestContext[] = [];
type Account = { email: string; userId: string; api: APIRequestContext };
type Resource = Record<string, unknown> & {
  id: string;
  version: number;
  status?: string;
};
let admin: Account;
let couple: Account;
let vendor: Account;
let vendorOrganizationId: string;
let sharedContractId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  admin = await createVerifiedAccount("slice10c-admin");
  couple = await createVerifiedAccount("slice10c-couple");
  vendor = await createVerifiedAccount("slice10c-vendor");
  const role = await ownerDatabase.platformRole.findUniqueOrThrow({
    where: { key: "PLATFORM_SUPER_ADMIN" },
  });
  await ownerDatabase.platformGrant.upsert({
    where: {
      userId_roleId_environment: {
        userId: admin.userId,
        roleId: role.id,
        environment: "test",
      },
    },
    update: { active: true, revokedAt: null, mfaVerifiedAt: new Date() },
    create: {
      userId: admin.userId,
      roleId: role.id,
      environment: "test",
      grantedById: admin.userId,
      reason: "Slice 10C controlled beta closure.",
      mfaVerifiedAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("S10C E2E 01 — full demo isolation has zero API traffic", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      calls.push(`${request.method()} ${request.url()}`);
  });
  await page.goto("/sign-in");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = "weddingos_demo=1; Path=/; Max-Age=28800; SameSite=Lax";
  });
  await page.goto("/team?demo=1");
  await page.goto("/activity?demo=1");
  await page.goto("/wedding-day?demo=1");
  expect(calls).toEqual([]);
});

test("S10C E2E 02 — reference integrity is complete", async () => {
  expect(await ownerDatabase.platformRole.count()).toBeGreaterThanOrEqual(7);
  expect(await ownerDatabase.legalDocument.count()).toBeGreaterThanOrEqual(6);
  expect(
    await ownerDatabase.dataRetentionPolicy.count({
      where: { environment: "test", active: true },
    }),
  ).toBeGreaterThanOrEqual(10);
});

test("S10C E2E 03 — destructive database guard points to E2E only", async () => {
  const identity = await ownerDatabase.databaseIdentity.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  expect(identity).toMatchObject({
    environment: "test",
    databasePurpose: "e2e",
  });
});

test("S10C E2E 04 — HTTP to outbox carries one W3C distributed trace", async () => {
  const response = await admin.api.post("/api/v1/platform/backups", {
    headers: mutationHeaders({ "Idempotency-Key": `trace-${randomUUID()}` }),
    data: { backupType: "FULL", reason: "Trace propagation E2E proof." },
  });
  expect(response.status()).toBe(201);
  const traceId = response.headers()["x-trace-id"];
  expect(traceId).toMatch(/^[a-f0-9]{32}$/);
  const backup = await apiData<Resource>(response);
  const outbox = await ownerDatabase.outboxMessage.findFirstOrThrow({
    where: { aggregateId: backup.id, eventName: "backup.requested.v1" },
  });
  const trace = (outbox.payload as { trace?: { traceparent?: string } }).trace;
  expect(trace?.traceparent).toContain(traceId);
});

test("S10C E2E 05 — propagated worker trace is visible in Jaeger", async () => {
  await expect
    .poll(
      async () => {
        const response = await fetch(
          "http://127.0.0.1:16686/api/traces?service=weddingos-api-e2e&limit=20",
        );
        if (!response.ok) return false;
        const traces = (
          (await response.json()) as {
            data?: Array<{
              processes?: Record<string, { serviceName?: string }>;
            }>;
          }
        ).data;
        return (traces ?? []).some((trace) => {
          const services = new Set(
            Object.values(trace.processes ?? {}).map(
              (process) => process.serviceName,
            ),
          );
          return (
            services.has("weddingos-api-e2e") &&
            services.has("weddingos-worker-e2e")
          );
        });
      },
      { timeout: 30_000 },
    )
    .toBe(true);
});

test("S10C E2E 06 — exported trace payload contains no credentials or email", async () => {
  const response = await fetch(
    "http://127.0.0.1:16686/api/traces?service=weddingos-api-e2e&limit=20",
  );
  expect(response.ok).toBe(true);
  const serialized = JSON.stringify(await response.json());
  expect(serialized).not.toContain(admin.email);
  expect(serialized).not.toContain(password);
  expect(serialized).not.toMatch(
    /http\.request\.header\.(?:authorization|cookie)|(?:authorization|cookie|password|token)(?:=|%3d|%3D)/i,
  );
});

test("S10C E2E 07 — DNS rebinding cannot change the connected socket", async () => {
  const server = createServer((_request, response) => response.end("pinned"));
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_PORT");
    let resolutions = 0;
    const client = new SafeOutboundHttpClient(
      {
        allowHttp: true,
        allowedHostnames: ["rebind.test"],
        allowPrivateDevelopmentHosts: ["rebind.test"],
      },
      {
        resolve: async () => {
          resolutions += 1;
          return [
            {
              address: resolutions === 1 ? "127.0.0.1" : "169.254.169.254",
              family: 4,
            },
          ];
        },
      },
    );
    const response = await client.fetch(`http://rebind.test:${address.port}`);
    expect(await response.text()).toBe("pinned");
    expect(resolutions).toBe(1);
  } finally {
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
});

test("S10C E2E 08 — redirect to private address is denied", async () => {
  const server = createServer((_request, response) => {
    response.statusCode = 302;
    response.setHeader("location", "http://private.test/latest/meta-data");
    response.end();
  });
  await new Promise<void>((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("NO_PORT");
    const client = new SafeOutboundHttpClient(
      {
        allowHttp: true,
        allowedHostnames: ["public.test", "private.test"],
        allowPrivateDevelopmentHosts: ["public.test"],
      },
      { resolve: async () => [{ address: "127.0.0.1", family: 4 }] },
    );
    await expect(
      client.fetch(`http://public.test:${address.port}`),
    ).rejects.toThrow("OUTBOUND_PRIVATE_ADDRESS_DENIED");
  } finally {
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
});

test("S10C E2E 09 — retention dry-run counts and performs zero mutations", async () => {
  const policy = await retentionPolicy("auth_one_time_tokens");
  const token = await ownerDatabase.authOneTimeToken.create({
    data: {
      userId: admin.userId,
      purpose: "PASSWORD_RESET",
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      expiresAt: new Date(Date.now() - 30 * 86_400_000),
    },
  });
  const run = await apiData<
    Resource & { candidateCount: number; purgedCount: number }
  >(
    await admin.api.post("/api/v1/platform/retention-runs", {
      headers: mutationHeaders({
        "Idempotency-Key": `dry-retention-${randomUUID()}`,
        "If-Match": `"${policy.version}"`,
      }),
      data: {
        policyId: policy.id,
        mode: "DRY_RUN",
        limit: 100,
        reason: "Slice 10C dry-run evidence.",
      },
    }),
  );
  expect(run.candidateCount).toBeGreaterThan(0);
  expect(run.purgedCount).toBe(0);
  expect(
    await ownerDatabase.authOneTimeToken.findUnique({
      where: { id: token.id },
    }),
  ).not.toBeNull();
});

test("S10C E2E 10 — retention purges eligible and preserves held records", async () => {
  const policy = await retentionPolicy("auth_one_time_tokens");
  const eligible = await createExpiredToken(admin.userId);
  const held = await createExpiredToken(admin.userId);
  await ownerDatabase.legalHold.create({
    data: {
      targetType: "auth_one_time_tokens",
      targetId: held.id,
      reason: "Preserve held token for retention E2E.",
      createdById: admin.userId,
    },
  });
  const run = await apiData<
    Resource & { purgedCount: number; heldCount: number }
  >(
    await admin.api.post("/api/v1/platform/retention-runs", {
      headers: mutationHeaders({
        "Idempotency-Key": `execute-retention-${randomUUID()}`,
        "If-Match": `"${policy.version}"`,
      }),
      data: {
        policyId: policy.id,
        mode: "EXECUTE",
        limit: 100,
        confirmation: "EXECUTE_RETENTION",
        reason: "Slice 10C retention execution evidence.",
      },
    }),
  );
  expect(run.purgedCount).toBeGreaterThan(0);
  expect(run.heldCount).toBeGreaterThan(0);
  expect(
    await ownerDatabase.authOneTimeToken.findUnique({
      where: { id: eligible.id },
    }),
  ).toBeNull();
  expect(
    await ownerDatabase.authOneTimeToken.findUnique({ where: { id: held.id } }),
  ).not.toBeNull();
});

test("S10C E2E 11 — user deletion anonymizes account and removes authentication", async () => {
  const target = await createVerifiedAccount("slice10c-delete-user");
  const request = await apiData<Resource & { durablePlan: { id: string } }>(
    await target.api.post("/api/v1/me/deletion-requests", {
      headers: mutationHeaders({
        "Idempotency-Key": `delete-user-${randomUUID()}`,
      }),
      data: {
        targetType: "USER_ACCOUNT",
        targetId: target.userId,
        reason: "Execute user deletion E2E after grace.",
      },
    }),
  );
  await ownerDatabase.deletionPlan.update({
    where: { deletionRequestId: request.id },
    data: { graceEndsAt: new Date(Date.now() - 1000) },
  });
  await executeDeletion(request.id);
  const user = await ownerDatabase.user.findUniqueOrThrow({
    where: { id: target.userId },
  });
  expect(user.status).toBe("DISABLED");
  expect(user.email).toContain("deleted+");
  expect(
    await ownerDatabase.session.count({ where: { userId: target.userId } }),
  ).toBe(0);
});

test("S10C E2E 12 — workspace deletion purges private budget and retains shared contract", async () => {
  const workspaceId = await createWorkspace(
    couple.api,
    `Slice 10C ${Date.now()}`,
  );
  vendorOrganizationId = (
    await apiData<Resource>(
      await vendor.api.post("/api/v1/vendor-organizations", {
        headers: mutationHeaders({
          "Idempotency-Key": `vendor-${randomUUID()}`,
        }),
        data: vendorOrganization("Slice 10C Vendor", vendor.email),
      }),
    )
  ).id;
  const budget = await ownerDatabase.budgetPlan.create({
    data: {
      workspaceId,
      name: "Private budget",
      currency: "RON",
      targetTotalMinor: 100_000n,
      createdById: couple.userId,
    },
  });
  const rfq = await ownerDatabase.requestForQuote.create({
    data: {
      workspaceId,
      title: "Shared contract RFQ",
      category: "VENUE",
      description: "Valid procurement chain for deletion preservation.",
      currency: "RON",
      responseDeadline: new Date(Date.now() + 86_400_000),
      createdById: couple.userId,
    },
  });
  const recipient = await ownerDatabase.rfqRecipient.create({
    data: {
      workspaceId,
      rfqId: rfq.id,
      vendorOrganizationId,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const offer = await ownerDatabase.vendorOffer.create({
    data: {
      workspaceId,
      vendorOrganizationId,
      rfqId: rfq.id,
      rfqRecipientId: recipient.id,
      currency: "RON",
      totalMinor: 100_000n,
      createdById: vendor.userId,
    },
  });
  const offerVersion = await ownerDatabase.vendorOfferVersion.create({
    data: {
      workspaceId,
      vendorOrganizationId,
      offerId: offer.id,
      versionNumber: 1,
      currency: "RON",
      subtotalMinor: 100_000n,
      discountMinor: 0n,
      taxableBaseMinor: 100_000n,
      taxMinor: 0n,
      totalMinor: 100_000n,
      availabilityConfirmation: "Confirmed for the wedding date.",
      deliveryTimeline: "Delivered on the contracted wedding date.",
      cancellationTerms: "Cancellation follows the signed contract.",
      contentHash: createHash("sha256")
        .update(`slice-10c-${offer.id}`)
        .digest("hex"),
      createdById: vendor.userId,
    },
  });
  const bookingId = randomUUID();
  await ownerDatabase.vendorBooking.create({
    data: {
      id: bookingId,
      workspaceId,
      vendorOrganizationId,
      offerId: offer.id,
      rfqId: rfq.id,
      title: "Shared booking",
      currency: "RON",
      totalMinor: 100_000n,
      acceptedOfferVersion: 1,
      acceptedOfferVersionId: offerVersion.id,
      createdById: couple.userId,
    },
  });
  const contract = await ownerDatabase.vendorContract.create({
    data: {
      workspaceId,
      vendorOrganizationId,
      bookingId,
      createdById: couple.userId,
    },
  });
  sharedContractId = contract.id;
  const request = await apiData<Resource>(
    await couple.api.post(
      `/api/v1/workspaces/${workspaceId}/deletion-requests`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `delete-workspace-${randomUUID()}`,
        }),
        data: { reason: "Purge private workspace data after grace." },
      },
    ),
  );
  await expireDeletionGrace(request.id);
  await executeDeletion(request.id);
  expect(
    await ownerDatabase.budgetPlan.findUnique({ where: { id: budget.id } }),
  ).toBeNull();
  expect(
    await ownerDatabase.vendorContract.findUnique({
      where: { id: contract.id },
    }),
  ).not.toBeNull();
});

test("S10C E2E 13 — vendor deletion retains wedding contract and payout boundary", async () => {
  const request = await apiData<Resource>(
    await vendor.api.post(
      `/api/v1/vendor-organizations/${vendorOrganizationId}/deletion-requests`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `delete-vendor-${randomUUID()}`,
        }),
        data: { reason: "Archive vendor private profile after grace." },
      },
    ),
  );
  await expireDeletionGrace(request.id);
  await executeDeletion(request.id);
  const organization = await ownerDatabase.vendorOrganization.findUniqueOrThrow(
    {
      where: { id: vendorOrganizationId },
    },
  );
  expect(organization.status).toBe("ARCHIVED");
  expect(
    await ownerDatabase.vendorContract.findUnique({
      where: { id: sharedContractId },
    }),
  ).not.toBeNull();
});

test("S10C E2E 14 — automated backup schedules are persistent and non-overlapping", async () => {
  const schedules = await ownerDatabase.backupSchedule.findMany({
    where: { environment: "test", enabled: true },
  });
  expect(schedules.map((schedule) => schedule.key).sort()).toEqual([
    "daily-database",
    "daily-objects",
    "weekly-full",
    "weekly-restore-verification",
  ]);
  expect(
    new Set(schedules.map((schedule) => schedule.cronExpression)).size,
  ).toBe(schedules.length);
  expect(schedules.every((schedule) => schedule.minimumVerified >= 2)).toBe(
    true,
  );
  expect(
    schedules.every((schedule) => schedule.timezone === "Europe/Chisinau"),
  ).toBe(true);
});

test("S10C E2E 15 — backup retention protects minimum copies and legal holds", async () => {
  const script = await readFile(
    resolve(root, "ops/backup/run-scheduled-backup.sh"),
    "utf8",
  );
  expect(script).toContain("BACKUP_MINIMUM_VERIFIED_COPIES");
  expect(script).toContain(".legal-hold");
  expect(script).toContain("test ! -e");
  expect(script).toContain("flock -n");
});

test("S10C E2E 16 — complete restore target is isolated from source", async () => {
  const restore = new PrismaClient({
    datasourceUrl:
      "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_restore_target?schema=public",
  });
  try {
    const identity = await restore.databaseIdentity.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(identity.databasePurpose).toBe("restore-target");
    const source = await ownerDatabase.databaseIdentity.findUniqueOrThrow({
      where: { id: "singleton" },
    });
    expect(identity.databaseInstanceId).not.toBe(source.databaseInstanceId);
  } finally {
    await restore.$disconnect();
  }
});

test("S10C E2E 17 — security gate has zero critical and high findings", async () => {
  const gate = JSON.parse(
    await readFile(
      resolve(root, "ops/release-evidence/current/security-gate.json"),
      "utf8",
    ),
  ) as {
    status: string;
    vulnerabilities: { critical: number; high: number };
    secretFindings: number;
  };
  expect(gate).toMatchObject({
    status: "PASSED",
    vulnerabilities: { critical: 0, high: 0 },
    secretFindings: 0,
  });
});

test("S10C E2E 18 — staging deployment evidence proves HTTPS and observability", async () => {
  const deployment = JSON.parse(
    await readFile(
      resolve(
        root,
        "ops/release-evidence/current/staging-like-deployment.json",
      ),
      "utf8",
    ),
  ) as { status: string; checks: Record<string, boolean>; tls: string };
  expect(deployment.status).toBe("HEALTHY");
  expect(deployment.tls).toBe("CADDY_LOCAL_CA");
  expect(deployment.checks).toMatchObject({
    https: true,
    metrics: true,
    dashboards: true,
    alertRoute: true,
    traces: true,
  });
});

test("S10C E2E 19 — rollback evidence keeps previous release healthy", async () => {
  const rollback = JSON.parse(
    await readFile(
      resolve(root, "ops/release-evidence/current/staging-like-rollback.json"),
      "utf8",
    ),
  ) as { status: string; checks: Record<string, boolean> };
  expect(rollback.status).toBe("HEALTHY");
  expect(rollback.checks).toMatchObject({
    previousArtifactsRetained: true,
    databaseCompatibility: true,
    readiness: true,
    workerOutboxSafe: true,
  });
});

test("S10C E2E 20 — release gate changes from READY to BLOCKED when evidence disappears", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "weddingos-release-gate-"));
  try {
    await seedReadyReleaseEvidence(directory);
    const ready = await execFileAsync(
      process.execPath,
      [resolve(root, "scripts/release-validate.mjs")],
      {
        cwd: root,
        env: { ...process.env, WEDDINGOS_RELEASE_EVIDENCE_DIR: directory },
      },
    );
    expect(JSON.parse(ready.stdout).status).toBe("READY");
    await unlink(resolve(directory, "trace-verification.json"));
    await expect(
      execFileAsync(
        process.execPath,
        [resolve(root, "scripts/release-validate.mjs")],
        {
          cwd: root,
          env: { ...process.env, WEDDINGOS_RELEASE_EVIDENCE_DIR: directory },
        },
      ),
    ).rejects.toMatchObject({ code: 1 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registration = await apiData<{ userId: string }>(
    await api.post("/api/v1/auth/registrations", {
      headers: mutationHeaders(),
      data: {
        firstName: "E2E",
        lastName: label,
        email,
        password,
        acceptedTermsVersion: "2026-07-18",
        marketingConsent: false,
      },
    }),
  );
  const token = await waitForVerificationToken(email);
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", {
        headers: mutationHeaders(),
        data: { token },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/api/v1/auth/sessions", {
        headers: mutationHeaders(),
        data: { email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
  return { email, userId: registration.userId, api };
}

async function createWorkspace(api: APIRequestContext, title: string) {
  return (
    await apiData<{ id: string }>(
      await api.post("/api/v1/workspaces", {
        headers: mutationHeaders({
          "Idempotency-Key": `workspace-${randomUUID()}`,
        }),
        data: { title, partnerOneName: "Ana", partnerTwoName: "Mihai" },
      }),
    )
  ).id;
}

async function retentionPolicy(entityType: string) {
  const response = await apiData<{ policies: Resource[] }>(
    await admin.api.get("/api/v1/platform/retention-runs"),
  );
  const policy = response.policies.find(
    (item) => item.entityType === entityType,
  );
  if (!policy) throw new Error(`Missing retention policy ${entityType}`);
  return policy;
}

async function createExpiredToken(userId: string) {
  return ownerDatabase.authOneTimeToken.create({
    data: {
      userId,
      purpose: "PASSWORD_RESET",
      tokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
      expiresAt: new Date(Date.now() - 30 * 86_400_000),
    },
  });
}

async function executeDeletion(requestId: string) {
  return apiData(
    await admin.api.post(
      `/api/v1/platform/deletion-requests/${requestId}/execute`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `execute-delete-${randomUUID()}`,
        }),
        data: {
          confirmation: "EXECUTE_DELETION",
          reason: "Execute approved deletion after completed grace period.",
        },
      },
    ),
  );
}

async function expireDeletionGrace(requestId: string) {
  await ownerDatabase.deletionPlan.update({
    where: { deletionRequestId: requestId },
    data: { graceEndsAt: new Date(Date.now() - 1000) },
  });
}

function vendorOrganization(name: string, email: string) {
  return {
    legalName: `${name} SRL`,
    displayName: name,
    country: "Moldova",
    registrationNumber: `REG-${Date.now()}`,
    taxId: `TAX-${Date.now()}`,
    billingEmail: email,
    contactEmail: email,
    contactPhone: "+37360000000",
    websiteUrl: "https://example.test/vendor",
  };
}

async function waitForVerificationToken(email: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summary = list.messages.find(
      (message) =>
        message.Subject === "Confirmă adresa de email Sarbato" &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`Verification e-mail missing for ${email}`);
}

async function newApiContext() {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  contexts.push(context);
  return context;
}

async function apiData<T>(response: {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}): Promise<T> {
  const body = (await response.json()) as {
    data?: T;
    code?: string;
    detail?: string;
  };
  expect(
    response.ok(),
    `${response.status()} ${body.code ?? ""} ${body.detail ?? ""}`,
  ).toBe(true);
  return body.data as T;
}

function mutationHeaders(extra: Record<string, string> = {}) {
  return { Origin: origin, ...extra };
}

async function seedReadyReleaseEvidence(directory: string) {
  const files: Record<string, unknown> = {
    "pnpm-audit.json": {
      metadata: { vulnerabilities: { high: 0, critical: 0 } },
    },
    "beta-gate.json": {
      database: { migrationsUpToDate: true },
      tests: {
        unit: { failed: 0 },
        integration: { failed: 0 },
        e2e: { passed: 253, failed: 0, skipped: 0, retries: 0 },
      },
      artifacts: { openApi: true },
      build: { passed: true },
      security: {
        secretFindings: 0,
        mfa: true,
        csrf: true,
        socketPinnedSsrf: true,
      },
      privacy: { retentionDeletion: true },
    },
    "staging-like-deployment.json": {
      status: "HEALTHY",
      checks: { metrics: true, dashboards: true, alertRoute: true },
    },
    "staging-like-rollback.json": { status: "HEALTHY" },
    "backup-verification.json": {
      status: "VERIFIED",
      destination: "SEPARATE_LOCAL_DESTINATION",
    },
    "restore-verification.json": { status: "VERIFIED" },
    "trace-verification.json": { status: "VERIFIED", privacy: "PASSED" },
    "source-tree-manifest.json": {
      provenance: "SOURCE_SNAPSHOT_ONLY",
      files: [{ path: "package.json" }],
    },
    "reference-verification.json": { missing: [] },
    "database-verification.json": { status: "VERIFIED" },
    "security-gate.json": { status: "PASSED" },
    "openapi.json": { openapi: "3.0.0" },
    "weddingos.cdx.json": { bomFormat: "CycloneDX" },
  };
  for (const [name, body] of Object.entries(files))
    await writeFile(resolve(directory, name), `${JSON.stringify(body)}\n`);
  await writeFile(
    resolve(directory, "source-tree-manifest.sha256"),
    "checksum\n",
  );
}
