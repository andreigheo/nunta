import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { PrismaClient } from "@weddingos/database";
const apiUrl = "http://127.0.0.1:4117",
  origin = "http://127.0.0.1:3117",
  password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
type Account = { email: string; userId: string; api: APIRequestContext };
const contexts: APIRequestContext[] = [];
let owner: Account, workspaceId: string;
test.skip(
  process.env.SARBATO_GEOAPIFY_LIVE_TEST !== "true",
  "Requires an explicitly enabled Free-tier provider test and private API key.",
);
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  owner = await createVerifiedAccount("geoapify-owner");
  workspaceId = (
    await createReadyWorkspace(owner.api, `Geoapify QA ${Date.now()}`)
  ).workspaceId;
});
test.afterAll(async () => {
  await Promise.all(contexts.map((c) => c.dispose()));
  await ownerDatabase.$disconnect();
});
for (const width of [1280, 360])
  test(`Geoapify real search and save after refresh ${width}`, async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    page.on("pageerror", error => browserErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await authorizePage(page, owner);
    await page.goto("/accommodation");
    await page
      .getByPlaceholder("De exemplu: Piața Sfatului, Brașov")
      .fill("Piața Universității, București, România");
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().includes("/accommodation-discovery") &&
        r.request().method() === "GET",
    );
    await page
      .getByRole("button", { name: "Caută variante", exact: true })
      .click();
    const response = await responsePromise;
    const result = (await response.json()).data;
    expect(response.ok()).toBe(true);
    expect(result.metadata.provider).toBe("geoapify");
    expect(result.metadata.status).toBe("available");
    expect(result.items.length).toBeGreaterThan(0);
    expect(
      result.items.every(
        (i: { source: string; priceSnapshot: unknown }) =>
          i.source === "geoapify" && i.priceSnapshot === null,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: /Powered by Geoapify/ }).first(),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/geoapify/screenshots/search-local-${width}.png`,
      fullPage: false,
    });
    if (width === 1280) {
      const first = result.items[0].name;
      await page
        .getByRole("button", { name: "Adaugă la recomandări", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("button", { name: "Adăugată", exact: true }).first(),
      ).toBeVisible();
      await page.reload();
      await page.getByRole("tab", { name: /Recomand/ }).click();
      await expect(
        page
          .getByRole("button", {
            name: new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          })
          .first(),
      ).toBeVisible();
      const saved = await apiData<{
        items: Array<{
          source: string;
          name: string;
          provenance: { attribution: string };
        }>;
      }>(
        await owner.api.get(
          `/api/v1/workspaces/${workspaceId}/accommodation-recommendations`,
        ),
      );
      expect(
        saved.items.some(
          (i) =>
            i.name === first &&
            i.source === "geoapify" &&
            i.provenance.attribution.includes("Geoapify"),
        ),
      ).toBe(true);
      await page.screenshot({
        path: "artifacts/geoapify/screenshots/saved-local-desktop.png",
        fullPage: false,
      });
    }
    expect(browserErrors).toEqual([]);
  });

async function authorizePage(page: Page, account: Account) {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
  const registration = await api.post("/api/v1/auth/registrations", {
    headers: mutationHeaders(),
    data: {
      firstName: "E2E",
      lastName: label,
      email,
      password,
      acceptedTermsVersion: "2026-07-18",
      marketingConsent: false,
    },
  });
  const registered = await apiData<{ userId: string }>(registration);
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

async function createReadyWorkspace(api: APIRequestContext, title: string) {
  const workspace = await apiData<{ id: string }>(
    await api.post("/api/v1/workspaces", {
      headers: mutationHeaders({
        "Idempotency-Key": `workspace-${crypto.randomUUID()}`,
      }),
      data: {
        title,
        partnerOneName: "Ana",
        partnerTwoName: "Mihai",
        weddingDate: "2027-09-12",
        location: "Chișinău",
        timezone: "Europe/Chisinau",
      },
    }),
  );
  await enableWorkspacePlan(ownerDatabase, workspace.id, owner.userId);
  const draft = await apiData<{ version: number }>(
    await api.get(`/api/v1/workspaces/${workspace.id}/onboarding`),
  );
  const saved = await apiData<{ version: number }>(
    await api.patch(`/api/v1/workspaces/${workspace.id}/onboarding`, {
      headers: mutationHeaders({ "If-Match": `"${draft.version}"` }),
      data: {
        currentStep: 8,
        couple: { confirmed: true, partnerOne: "Ana", partnerTwo: "Mihai" },
        dateEvents: {
          confirmed: true,
          exactDate: "2027-09-12",
          civil: true,
          religious: true,
          reception: true,
        },
        location: { confirmed: true, city: "Chișinău", venue: "Sala E2E" },
        guests: {
          confirmed: true,
          guestCount: 80,
          transport: true,
          accommodation: true,
        },
        budget: { confirmed: true, amount: 120000 },
        style: { confirmed: true, priorities: ["familie"] },
        existingProgress: { confirmed: true },
        planningPreferences: { confirmed: true, assistanceLevel: "guided" },
      },
    }),
  );
  await apiData(
    await api.post(`/api/v1/workspaces/${workspace.id}/onboarding/complete`, {
      headers: mutationHeaders({
        "If-Match": `"${saved.version}"`,
        "Idempotency-Key": `complete-${crypto.randomUUID()}`,
      }),
    }),
  );
  return { workspaceId: workspace.id };
}

async function enableWorkspacePlan(
  database: PrismaClient,
  targetWorkspaceId: string,
  actorUserId: string,
) {
  await database.workspaceSubscription.upsert({
    where: { workspaceId: targetWorkspaceId },
    update: { planKey: "PRO", status: "ACTIVE", updatedById: actorUserId },
    create: {
      workspaceId: targetWorkspaceId,
      planKey: "PRO",
      status: "ACTIVE",
      createdById: actorUserId,
      updatedById: actorUserId,
    },
  });
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
