import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const workspaceId = "55550000-0000-4000-8000-000000000001";
const vendorOrganizationId = "55550000-0000-4000-8000-000000000002";
const contexts: APIRequestContext[] = [];

const workspaceAccounts = [
  {
    email: "owner@weddingos.local",
    role: "couple_owner",
    required: ["workspace.delete", "team.invite", "settings.update"],
    forbidden: ["admin.none"],
  },
  {
    email: "partner@weddingos.local",
    role: "couple_partner",
    required: ["team.read", "settings.update", "payment.write"],
    forbidden: ["workspace.delete", "workspace.transfer_ownership"],
  },
  {
    email: "planner@weddingos.local",
    role: "wedding_planner",
    required: ["planning.write", "wedding_day.go_live", "offer.read"],
    forbidden: ["workspace.delete", "team.invite", "settings.update"],
  },
  {
    email: "family@weddingos.local",
    role: "family_collaborator",
    required: ["team.read", "planning.read", "guest.read"],
    forbidden: ["planning.write", "guest.write", "payment.write"],
  },
  {
    email: "viewer@weddingos.local",
    role: "viewer",
    required: ["planning.read", "calendar.read", "review.report"],
    forbidden: ["team.read", "planning.write", "invitation.write"],
  },
] as const;

const vendorAccounts = [
  {
    email: "vendor-owner@weddingos.local",
    role: "vendor_owner",
    required: [
      "vendor.organization.write",
      "vendor.services.write",
      "vendor.booking.transition",
      "vendor.subscription.manage",
    ],
    forbidden: [] as string[],
  },
  {
    email: "vendor-manager@weddingos.local",
    role: "vendor_manager",
    required: [
      "vendor.members.write",
      "vendor.profile.publish",
      "vendor.contract.write",
      "vendor.subscription.manage",
    ],
    forbidden: [] as string[],
  },
  {
    email: "vendor-sales@weddingos.local",
    role: "vendor_sales",
    required: [
      "vendor.rfq.decline",
      "vendor.offer.write",
      "vendor.offer.submit",
    ],
    forbidden: [
      "vendor.organization.write",
      "vendor.services.write",
      "vendor.booking.transition",
      "vendor.subscription.manage",
    ],
  },
  {
    email: "vendor-operations@weddingos.local",
    role: "vendor_operations",
    required: ["vendor.availability.write", "vendor.booking.transition"],
    forbidden: [
      "vendor.rfq.read",
      "vendor.offer.write",
      "vendor.services.write",
      "vendor.subscription.manage",
    ],
  },
  {
    email: "vendor-viewer@weddingos.local",
    role: "vendor_viewer",
    required: [
      "vendor.profile.read",
      "vendor.services.read",
      "vendor.booking.read",
      "vendor.subscription.read",
    ],
    forbidden: [
      "vendor.profile.write",
      "vendor.services.write",
      "vendor.availability.write",
      "vendor.offer.write",
      "vendor.booking.transition",
      "vendor.contract.write",
      "vendor.subscription.manage",
    ],
  },
] as const;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync(process.execPath, ["scripts/seed-local-test-accounts.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_OWNER_URL:
        "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
      WEDDINGOS_ALLOW_LOCAL_TEST_ACCOUNTS: "true",
      WEDDINGOS_PLATFORM_ENV: "test",
    },
    stdio: "pipe",
  });
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
});

test("Role matrix — all five event roles receive the exact bounded workspace context", async () => {
  for (const definition of workspaceAccounts) {
    const api = await signedInApi(definition.email);
    const workspaces = await apiData<Array<Record<string, unknown>>>(
      await api.get("/api/v1/workspaces"),
    );
    const summary = workspaces.find((item) => item.id === workspaceId);
    expect(summary, definition.email).toBeTruthy();
    expect(summary?.role).toBe(definition.role);

    const bootstrap = await apiData<{
      membership: { roleTemplate: string; capabilities: string[] };
    }>(await api.get(`/api/v1/workspaces/${workspaceId}/bootstrap`));
    expect(bootstrap.membership.roleTemplate).toBe(definition.role);
    expect(bootstrap.membership.capabilities).toEqual(
      expect.arrayContaining([...definition.required]),
    );
    for (const capability of definition.forbidden) {
      expect(bootstrap.membership.capabilities).not.toContain(capability);
    }
    if (bootstrap.membership.capabilities.includes("invitation.read")) {
      expect(
        (
          await api.get(`/api/v1/workspaces/${workspaceId}/creative-state`)
        ).status(),
        `${definition.email} creative-state`,
      ).toBe(200);
    }

    const me = await apiData<{
      contexts: {
        workspaces: boolean;
        vendorOrganizations: boolean;
        platform: boolean;
      };
    }>(await api.get("/api/v1/me"));
    expect(me.contexts).toEqual({
      workspaces: true,
      vendorOrganizations: false,
      platform: false,
    });
  }
});

test("Role matrix — protected workspace routes honor readable and read-only roles", async ({
  browser,
}) => {
  const familyPage = await signedInPage(browser, "family@weddingos.local");
  await familyPage.goto("/team");
  await expect(familyPage).toHaveURL(/\/team/);
  await expect(familyPage.getByText("Acces restricționat")).toHaveCount(0);
  await expect(
    familyPage.getByRole("button", { name: "Invită membru" }),
  ).toHaveCount(0);

  const viewerPage = await signedInPage(browser, "viewer@weddingos.local");
  await viewerPage.goto("/overview");
  await expect(viewerPage).toHaveURL(/\/overview/);
  await viewerPage.goto("/team");
  await expect(viewerPage).toHaveURL(/\/team/);
  await expect(
    viewerPage.getByText("Acest modul nu face parte din rolul tău"),
  ).toBeVisible();
  await viewerPage.context().close();

  await familyPage.context().close();
});

test("Role matrix — family collaborator uses creative and task surfaces read-only", async ({
  browser,
}) => {
  const familyPage = await signedInPage(browser, "family@weddingos.local");

  await familyPage.goto("/design-studio");
  await expect(familyPage.getByText("doar citire")).toBeVisible();
  await expect(
    familyPage.getByRole("button", { name: "Salvează conceptul" }),
  ).toBeDisabled();
  await expect(familyPage.getByLabel("Numele conceptului")).toBeDisabled();

  await familyPage.goto("/moodboards");
  await expect(familyPage.getByText("doar citire")).toBeVisible();
  await expect(
    familyPage.getByRole("button", { name: "Moodboard nou" }),
  ).toBeDisabled();
  await expect(
    familyPage.getByRole("button", { name: "Salvează", exact: true }),
  ).toBeDisabled();

  await familyPage.goto("/post-wedding");
  await expect(familyPage.getByText("doar citire")).toBeVisible();
  await expect(
    familyPage.getByRole("button", { name: "Adaugă un pas" }),
  ).toHaveCount(0);

  await familyPage.context().close();
});

test("Role matrix — demo marketplace opens a complete public provider profile", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/marketplace?demo=1");
  await page
    .getByRole("button", { name: "Profilul Andrei Dăscălescu" })
    .click();
  await expect(page).toHaveURL(/\/marketplace\/demo-andrei-d-sc-lescu/);
  await expect(page.getByTestId("vendor-public-profile")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Andrei Dăscălescu", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Servicii" })).toBeVisible();
  await expect(page.getByText("Furnizor negăsit")).toHaveCount(0);
  await context.close();
});

test("Role matrix — all five provider roles expose only their effective capabilities", async () => {
  for (const definition of vendorAccounts) {
    const api = await signedInApi(definition.email);
    const result = await apiData<{ items: Array<Record<string, unknown>> }>(
      await api.get("/api/v1/vendor-organizations"),
    );
    const organization = result.items.find(
      (item) => item.id === vendorOrganizationId,
    );
    expect(organization, definition.email).toBeTruthy();
    expect(organization?.role).toBe(definition.role);
    const capabilities = Array.isArray(organization?.capabilities)
      ? organization.capabilities.map(String)
      : [];
    expect(capabilities).toEqual(
      expect.arrayContaining([...definition.required]),
    );
    for (const capability of definition.forbidden) {
      expect(capabilities).not.toContain(capability);
    }
  }

  const viewer = await signedInApi("vendor-viewer@weddingos.local");
  const forbiddenService = await viewer.post(
    `/api/v1/vendor-organizations/${vendorOrganizationId}/services`,
    {
      headers: mutationHeaders({ "Idempotency-Key": randomUUID() }),
      data: {
        category: "PHOTOGRAPHY",
        name: "Operație interzisă",
        description: "Nu trebuie să poată fi creată de viewer.",
        pricingModel: "FIXED",
        startingPriceMinor: 100_000,
        currency: "RON",
        active: true,
      },
    },
  );
  expect(forbiddenService.status()).toBe(403);

  const operations = await signedInApi("vendor-operations@weddingos.local");
  expect(
    (
      await operations.get(
        `/api/v1/vendor-organizations/${vendorOrganizationId}/rfqs`,
      )
    ).status(),
  ).toBe(403);
});

test("Role matrix — provider UI hides mutations before an unauthorized click", async ({
  browser,
}) => {
  const viewerPage = await signedInPage(
    browser,
    "vendor-viewer@weddingos.local",
  );
  await viewerPage.goto(
    `/vendor/services?organization=${vendorOrganizationId}`,
  );
  await expect(
    viewerPage.getByText("Ai acces de consultare", { exact: false }),
  ).toBeVisible();
  await expect(
    viewerPage.getByRole("button", { name: "Serviciu" }),
  ).toHaveCount(0);
  await expect(
    viewerPage.getByRole("button", { name: "Disponibilitate" }),
  ).toHaveCount(0);

  const operationsPage = await signedInPage(
    browser,
    "vendor-operations@weddingos.local",
  );
  await operationsPage.goto(
    `/vendor/services?organization=${vendorOrganizationId}`,
  );
  await expect(
    operationsPage.getByRole("button", { name: "Disponibilitate" }),
  ).toBeVisible();
  await expect(
    operationsPage.getByRole("button", { name: "Serviciu" }),
  ).toHaveCount(0);
  await expect(
    operationsPage.getByText("Serviciile nu au putut fi încărcate"),
  ).toHaveCount(0);
  await viewerPage.context().close();
  await operationsPage.context().close();
});

test("Role matrix — platform administrator is isolated from ordinary accounts", async () => {
  const admin = await signedInApi("admin@weddingos.local");
  const me = await apiData<{
    contexts: { platform: boolean };
    globalCapabilities: string[];
  }>(await admin.get("/api/v1/me"));
  expect(me.contexts.platform).toBe(true);
  expect(me.globalCapabilities).toContain("platform.dashboard.read");
  expect((await admin.get("/api/v1/platform/dashboard")).status()).toBe(200);

  const regular = await signedInApi("owner@weddingos.local");
  const regularMe = await apiData<{
    contexts: { platform: boolean };
    globalCapabilities: string[];
  }>(await regular.get("/api/v1/me"));
  expect(regularMe.contexts.platform).toBe(false);
  expect(regularMe.globalCapabilities).toEqual([]);
  expect((await regular.get("/api/v1/platform/dashboard")).status()).toBe(403);
});

async function signedInApi(email: string) {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  contexts.push(context);
  const response = await context.post("/api/v1/auth/sessions", {
    headers: mutationHeaders(),
    data: { email, password, remember: true },
  });
  expect(response.status(), email).toBe(200);
  return context;
}

async function signedInPage(browser: Browser, email: string) {
  const context = await browser.newContext();
  const response = await context.request.post(
    `${apiUrl}/api/v1/auth/sessions`,
    {
      headers: mutationHeaders(),
      data: { email, password, remember: true },
    },
  );
  expect(response.status(), email).toBe(200);
  const page = await context.newPage();
  return page;
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
