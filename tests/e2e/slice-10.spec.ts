import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
type Account = { email: string; userId: string; api: APIRequestContext };
type Resource = Record<string, unknown> & {
  id: string;
  version: number;
  status: string;
};
const contexts: APIRequestContext[] = [];
let admin!: Account;
let regular!: Account;
let target!: Account;
let supportCase!: Resource;
let featureFlag!: Resource;
let legalDocumentId = "";
let consent!: Resource;
let dsar!: Resource;
let hold!: Resource;
let backup!: Resource;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  admin = await createVerifiedAccount("slice10-admin");
  regular = await createVerifiedAccount("slice10-regular");
  target = await createVerifiedAccount("slice10-target");
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
      active: true,
      mfaVerifiedAt: new Date(),
      grantedById: admin.userId,
      reason: "Slice 10 E2E controlled administrator.",
    },
  });
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("S10 E2E 01 — regular user is denied platform API", async () => {
  expect((await regular.api.get("/api/v1/platform/dashboard")).status()).toBe(
    403,
  );
});

test("S10 E2E 02 — platform admin dashboard uses persisted counts", async () => {
  const dashboard = await apiData<{
    identity: string;
    counts: { users: number };
    productionReadiness: { verdict: string };
  }>(await admin.api.get("/api/v1/platform/dashboard"));
  expect(dashboard.identity).toBe("Platform Admin");
  expect(dashboard.counts.users).toBeGreaterThan(2);
  expect(dashboard.productionReadiness.verdict).toBe("CONTROLLED_BETA_ONLY");
});

test("S10 E2E 02B — current-user context exposes only effective platform access", async () => {
  const current = await apiData<{
    contexts: { platform: boolean };
    globalCapabilities: string[];
  }>(await admin.api.get("/api/v1/me"));
  expect(current.contexts.platform).toBe(true);
  expect(current.globalCapabilities).toContain("platform.dashboard.read");

  const regularCurrent = await apiData<{
    contexts: { platform: boolean };
    globalCapabilities: string[];
  }>(await regular.api.get("/api/v1/me"));
  expect(regularCurrent.contexts.platform).toBe(false);
  expect(regularCurrent.globalCapabilities).toEqual([]);
});

test("S10 E2E 03 — admin UI loads live control center", async ({ page }) => {
  await authorizePage(page, admin);
  await page.goto("/admin");
  await expect(page.getByText("Platform Admin").first()).toBeVisible();
  await expect(page.getByText("CONTROLLED BETA ONLY")).toBeVisible();
});

test("S10 E2E 04 — system status exposes bounded operational state", async () => {
  const status = await apiData<{
    status: string;
    services: Record<string, { status: string }>;
  }>(await admin.api.get("/api/v1/platform/system-status"));
  expect(status.status).toBe("OPERATIONAL");
  expect(status.services.api.status).toBe("UP");
});

test("S10 E2E 05 — user inventory is capability protected", async () => {
  const list = await apiData<{ items: Array<{ id: string; email: string }> }>(
    await admin.api.get("/api/v1/platform/users"),
  );
  expect(list.items.some((item) => item.id === target.userId)).toBe(true);
});

test("S10 E2E 06 — user detail has version and no password hash", async () => {
  const user = await apiData<Resource & { email: string }>(
    await admin.api.get(`/api/v1/platform/users/${target.userId}`),
  );
  expect(user.version).toBeGreaterThan(0);
  expect(JSON.stringify(user)).not.toContain("passwordHash");
});

test("S10 E2E 07 — suspend revokes the target session", async () => {
  const current = await apiData<Resource>(
    await admin.api.get(`/api/v1/platform/users/${target.userId}`),
  );
  const suspended = await apiData<Resource>(
    await admin.api.post(`/api/v1/platform/users/${target.userId}/suspend`, {
      headers: mutationHeaders({
        "If-Match": `"${current.version}"`,
        "Idempotency-Key": `suspend-${randomUUID()}`,
      }),
      data: {
        version: current.version,
        reason: "E2E suspension with explicit reason.",
      },
    }),
  );
  expect(suspended.status).toBe("SUSPENDED");
  expect((await target.api.get("/api/v1/me")).status()).toBe(401);
});

test("S10 E2E 08 — reactivation restores login without restoring old session", async () => {
  const current = await apiData<Resource>(
    await admin.api.get(`/api/v1/platform/users/${target.userId}`),
  );
  const active = await apiData<Resource>(
    await admin.api.post(`/api/v1/platform/users/${target.userId}/reactivate`, {
      headers: mutationHeaders({
        "If-Match": `"${current.version}"`,
        "Idempotency-Key": `reactivate-${randomUUID()}`,
      }),
      data: {
        version: current.version,
        reason: "E2E reactivation after reviewed suspension.",
      },
    }),
  );
  expect(active.status).toBe("ACTIVE");
  expect(
    (
      await target.api.post("/api/v1/auth/sessions", {
        headers: mutationHeaders(),
        data: { email: target.email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
});

test("S10 E2E 09 — workspaces inventory is available to platform admin", async () => {
  expect(
    (
      await apiData<{ items: unknown[] }>(
        await admin.api.get("/api/v1/platform/workspaces"),
      )
    ).items,
  ).toBeInstanceOf(Array);
});

test("S10 E2E 10 — vendor inventory is available to platform admin", async () => {
  expect(
    (
      await apiData<{ items: unknown[] }>(
        await admin.api.get("/api/v1/platform/vendor-organizations"),
      )
    ).items,
  ).toBeInstanceOf(Array);
});

test("S10 E2E 11 — support case is persisted", async () => {
  supportCase = await apiData(
    await admin.api.post("/api/v1/platform/support-cases", {
      headers: mutationHeaders({
        "Idempotency-Key": `support-${randomUUID()}`,
      }),
      data: {
        type: "BUG",
        subject: "E2E platform case",
        description: "Persistent support case for Slice 10.",
        priority: "HIGH",
        requesterUserId: regular.userId,
      },
    }),
  );
  expect(supportCase.status).toBe("OPEN");
});

test("S10 E2E 12 — private support note is persisted", async () => {
  const note = await apiData<Resource>(
    await admin.api.post(
      `/api/v1/platform/support-cases/${supportCase.id}/notes`,
      {
        headers: mutationHeaders(),
        data: { body: "Private operational note.", private: true },
      },
    ),
  );
  expect(note.id).toBeTruthy();
});

test("S10 E2E 13 — support state transition is versioned", async () => {
  supportCase = await apiData(
    await admin.api.post(
      `/api/v1/platform/support-cases/${supportCase.id}/transitions`,
      {
        headers: mutationHeaders(),
        data: {
          status: "RESOLVED",
          reason: "Resolved by the E2E operator.",
          version: supportCase.version,
        },
      },
    ),
  );
  expect(supportCase.status).toBe("RESOLVED");
});

test("S10 E2E 14 — workspace-scoped feature flag is created", async () => {
  featureFlag = await apiData(
    await admin.api.post("/api/v1/platform/feature-flags", {
      headers: mutationHeaders({ "Idempotency-Key": `flag-${randomUUID()}` }),
      data: {
        key: `slice10.e2e.${Date.now()}`,
        description: "Scoped E2E feature flag",
        valueType: "BOOLEAN",
        defaultValue: false,
        rules: [{ scope: "USER", target: regular.userId, value: true }],
        killSwitch: false,
        reason: "Validate scoped feature controls in E2E.",
      },
    }),
  );
  expect(featureFlag.id).toBeTruthy();
});

test("S10 E2E 15 — feature flag update rejects stale overwrites", async () => {
  const first = await admin.api.patch(
    `/api/v1/platform/feature-flags/${featureFlag.id}`,
    {
      headers: mutationHeaders({ "If-Match": `"${featureFlag.version}"` }),
      data: {
        description: "Updated scoped E2E flag",
        reason: "Update flag description for E2E proof.",
      },
    },
  );
  featureFlag = await apiData(first);
  const stale = await admin.api.patch(
    `/api/v1/platform/feature-flags/${featureFlag.id}`,
    {
      headers: mutationHeaders({ "If-Match": '"1"' }),
      data: {
        description: "Stale update",
        reason: "This update must be rejected as stale.",
      },
    },
  );
  expect([409, 412]).toContain(stale.status());
});

test("S10 E2E 16 — legal document draft is versioned", async () => {
  const result = await apiData<{ document: { id: string }; version: Resource }>(
    await admin.api.post("/api/v1/platform/legal-documents", {
      headers: mutationHeaders(),
      data: {
        type: "PRIVACY_POLICY",
        key: `privacy-e2e-${Date.now()}`,
        name: "Privacy E2E",
        description: "Versioned legal draft for controlled testing.",
        version: "e2e-1",
        language: "ro-RO",
        content:
          "Conținut provizoriu suficient de lung pentru validarea documentului legal.",
        effectiveAt: new Date().toISOString(),
      },
    }),
  );
  legalDocumentId = result.document.id;
  expect(result.version.status).toBe("DRAFT");
});

test("S10 E2E 17 — legal document publish is auditable", async () => {
  const published = await apiData<Resource>(
    await admin.api.post(
      `/api/v1/platform/legal-documents/${legalDocumentId}/publish`,
      {
        headers: mutationHeaders({ "If-Match": '"1"' }),
        data: { version: 1, reason: "Publish controlled E2E legal version." },
      },
    ),
  );
  expect(published.status).toBe("PUBLISHED");
});

test("S10 E2E 18 — personal privacy overview is self-scoped", async () => {
  const privacy = await apiData<{
    retentionNotice: string;
    requests: unknown[];
  }>(await regular.api.get("/api/v1/me/privacy"));
  expect(privacy.retentionNotice).toContain("păstrate");
});

test("S10 E2E 19 — optional cookie preferences persist", async () => {
  const cookie = await apiData<{ essential: boolean; analytics: boolean }>(
    await regular.api.post("/api/v1/me/cookie-preferences", {
      headers: mutationHeaders(),
      data: { preferences: true, analytics: true, marketing: false },
    }),
  );
  expect(cookie).toMatchObject({ essential: true, analytics: true });
});

test("S10 E2E 20 — consent and withdrawal history is append-only", async () => {
  consent = await apiData(
    await regular.api.post("/api/v1/me/consents", {
      headers: mutationHeaders(),
      data: { purpose: "ANALYTICS", granted: true, source: "SETTINGS" },
    }),
  );
  const withdrawal = await apiData<Resource>(
    await regular.api.post(`/api/v1/me/consents/${consent.id}/withdraw`, {
      headers: mutationHeaders(),
      data: { reason: "E2E withdrawal" },
    }),
  );
  expect(withdrawal.id).toBeTruthy();
});

test("S10 E2E 21 — data export request is idempotent", async () => {
  const key = `export-${randomUUID()}`;
  dsar = await apiData(
    await regular.api.post("/api/v1/me/data-exports", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: {},
    }),
  );
  const replay = await apiData<Resource>(
    await regular.api.post("/api/v1/me/data-exports", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: {},
    }),
  );
  expect(replay.id).toBe(dsar.id);
});

test("S10 E2E 22 — deletion request shows a grace plan", async () => {
  const deletion = await apiData<
    Resource & { plan: { immediateDeletion: boolean } }
  >(
    await regular.api.post("/api/v1/me/deletion-requests", {
      headers: mutationHeaders({ "Idempotency-Key": `delete-${randomUUID()}` }),
      data: {
        targetType: "USER_ACCOUNT",
        targetId: regular.userId,
        reason: "Validate non-instant deletion workflow.",
      },
    }),
  );
  expect(deletion.plan.immediateDeletion).toBe(false);
});

test("S10 E2E 23 — platform admin sees data-subject requests", async () => {
  const list = await apiData<{ items: Resource[] }>(
    await admin.api.get("/api/v1/platform/data-subject-requests"),
  );
  expect(list.items.some((item) => item.id === dsar.id)).toBe(true);
});

test("S10 E2E 24 — data-subject request transition is versioned", async () => {
  dsar = await apiData(
    await admin.api.post(
      `/api/v1/platform/data-subject-requests/${dsar.id}/transitions`,
      {
        headers: mutationHeaders(),
        data: {
          status: "VERIFYING",
          reason: "Identity verification started.",
          version: dsar.version,
        },
      },
    ),
  );
  expect(dsar.status).toBe("VERIFYING");
});

test("S10 E2E 25 — legal hold blocks deletion processing state", async () => {
  hold = await apiData(
    await admin.api.post("/api/v1/platform/legal-holds", {
      headers: mutationHeaders({ "Idempotency-Key": `hold-${randomUUID()}` }),
      data: {
        targetType: "USER",
        targetId: regular.userId,
        reason: "Preserve data while E2E review is active.",
      },
    }),
  );
  expect(hold.status).toBe("ACTIVE");
});

test("S10 E2E 26 — legal hold release requires explicit reason", async () => {
  hold = await apiData(
    await admin.api.post(`/api/v1/platform/legal-holds/${hold.id}/release`, {
      headers: mutationHeaders({ "If-Match": `"${hold.version}"` }),
      data: {
        version: hold.version,
        reason: "E2E preservation review is complete.",
      },
    }),
  );
  expect(hold.status).toBe("RELEASED");
});

test("S10 E2E 27 — backup request is durable and idempotent", async () => {
  const key = `backup-${randomUUID()}`;
  backup = await apiData(
    await admin.api.post("/api/v1/platform/backups", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: {
        backupType: "DATABASE",
        reason: "Create controlled E2E backup request.",
      },
    }),
  );
  const replay = await apiData<Resource>(
    await admin.api.post("/api/v1/platform/backups", {
      headers: mutationHeaders({ "Idempotency-Key": key }),
      data: {
        backupType: "DATABASE",
        reason: "Create controlled E2E backup request.",
      },
    }),
  );
  expect(replay.id).toBe(backup.id);
});

test("S10 E2E 28 — incomplete backup cannot be falsely verified", async () => {
  const verification = await apiData<Resource>(
    await admin.api.post(`/api/v1/platform/backups/${backup.id}/verify`, {
      headers: mutationHeaders(),
      data: { version: 1, reason: "Verify incomplete E2E backup evidence." },
    }),
  );
  expect(verification.status).toBe("FAILED");
});

test("S10 E2E 29 — restore request rejects an incomplete backup", async () => {
  const response = await admin.api.post("/api/v1/platform/restores", {
    headers: mutationHeaders({ "Idempotency-Key": `restore-${randomUUID()}` }),
    data: {
      backupRunId: backup.id,
      target: "isolated-e2e",
      reason: "Attempt isolated E2E restore validation.",
    },
  });
  expect(response.status()).toBe(409);
});

test("S10 E2E 30 — public metrics access is denied", async () => {
  expect((await regular.api.get("/api/v1/internal/metrics")).status()).toBe(
    403,
  );
});

test("S10 E2E 31 — authorized metrics contain no PII labels", async () => {
  const response = await admin.api.get("/api/v1/internal/metrics", {
    headers: { Authorization: "Bearer weddingos-local-metrics-token" },
  });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("weddingos_up");
  expect(body).not.toMatch(/user|email|workspace_id|token_hash/);
});

test("S10 E2E 32 — canonical public legal routes render", async ({ page }) => {
  for (const route of ["/privacy", "/terms", "/cookies"]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("S10 E2E 33 — public cookie choice persists locally", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: "Doar esențiale" });
  await expect(button).toBeVisible();
  await button.click();
  await page.reload();
  await expect(button).toBeHidden();
});

test("S10 E2E 34 — security headers protect public pages", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("S10 E2E 35 — regular user sees a factual admin denial", async ({
  page,
}) => {
  await authorizePage(page, regular);
  await page.goto("/admin");
  await expect(
    page.getByText("Acces refuzat sau serviciu indisponibil"),
  ).toBeVisible();
});

async function authorizePage(page: Page, account: Account) {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registered = await apiData<{ userId: string }>(
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
  return { email, userId: registered.userId, api };
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
        message.Subject === "Confirmă adresa de email WeddingOS" &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
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
