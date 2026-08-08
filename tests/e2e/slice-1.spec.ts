import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";

type Account = {
  email: string;
  userId: string;
  api: APIRequestContext;
};

let invitationOwner: Account;
let invitationPartner: Account;
let invitationWorkspaceId: string;
let invitationPartnerMembershipId: string;
const retainedContexts: APIRequestContext[] = [];

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await Promise.all(retainedContexts.map((context) => context.dispose()));
});

test("E2E 1 — owner account, verification, sign-in, workspace and protected shell", async ({
  page,
}) => {
  const browserApiOrigins: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) browserApiOrigins.push(url.origin);
  });
  const email = uniqueEmail("owner-onboarding");
  await page.goto("/create-account");
  await page.locator('input[autocomplete="given-name"]').fill("Ana");
  await page.locator('input[autocomplete="family-name"]').fill("Pop");
  await page.locator('input[type="email"]').fill(email);
  await page
    .locator('input[autocomplete="new-password"]')
    .nth(0)
    .fill(password);
  await page
    .locator('input[autocomplete="new-password"]')
    .nth(1)
    .fill(password);
  await page.getByRole("checkbox", { name: /Accept Termenii/ }).click();
  await page.getByRole("button", { name: "Creează contul" }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  const token = await waitForEmailToken(
    email,
    "Confirmă adresa de email WeddingOS",
  );
  await page.goto(
    `/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`,
  );
  await expect(page).toHaveURL(/\/sign-in\?verified=1/);
  await signInThroughUi(page, email);
  await expect(page).toHaveURL(/\/onboarding/);

  await page.getByPlaceholder("Ana Dumitrescu").fill("Ana Pop");
  await page.getByPlaceholder("Mihai Ionescu").fill("Mihai Pop");
  await page.getByPlaceholder("Ana & Mihai").fill("Ana & Mihai E2E");
  for (let step = 1; step < 8; step += 1) {
    await page.getByRole("button", { name: "Continuă" }).click();
  }
  await page.getByRole("button", { name: "Finalizează configurarea" }).click();
  await expect(page).toHaveURL(/\/overview/, { timeout: 30_000 });
  await expect(page.getByText("Ana & Mihai E2E").first()).toBeVisible();
  expect(
    (await page.context().cookies()).some(
      (cookie) => cookie.name === "weddingos_session" && cookie.httpOnly,
    ),
  ).toBe(true);
  expect(browserApiOrigins.length).toBeGreaterThan(0);
  expect([...new Set(browserApiOrigins)]).toEqual([origin]);
  expect(browserApiOrigins).not.toContain(apiUrl);
});

test("E2E 2 — owner invitation email and partner acceptance", async ({
  page,
  browser,
}) => {
  invitationOwner = await createVerifiedAccount("invite-owner");
  invitationPartner = await createVerifiedAccount("invite-partner");
  invitationWorkspaceId = await createWorkspace(
    invitationOwner.api,
    "Workspace Partener E2E",
  );

  await page.goto("/sign-in");
  await signInThroughUi(page, invitationOwner.email);
  await expect(page).toHaveURL(/\/overview/);
  await page.goto("/team");
  await page.getByRole("button", { name: "Invită membru" }).click();
  await page.locator("#invite-email").fill(invitationPartner.email);
  await page.locator("#invite-role").selectOption("partner");
  await page.getByRole("button", { name: "Trimite invitația" }).click();
  await expect(page.getByText(invitationPartner.email).first()).toBeVisible();

  const token = await waitForEmailToken(
    invitationPartner.email,
    "Invitație în Workspace Partener E2E",
  );
  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/sign-in");
  await signInThroughUi(partnerPage, invitationPartner.email);
  await partnerPage.goto(`/invitation?token=${encodeURIComponent(token)}`);
  await expect(
    partnerPage.getByText("Workspace Partener E2E", { exact: true }),
  ).toBeVisible();
  await partnerPage.getByRole("button", { name: "Acceptă invitația" }).click();
  await expect(partnerPage).toHaveURL(/\/overview/);
  await expect(
    partnerPage.getByText("Workspace Partener E2E").first(),
  ).toBeVisible();
  await partnerContext.close();

  const team = await apiData<{
    members: Array<{ id: string; email: string }>;
  }>(
    await invitationOwner.api.get(
      `/api/v1/workspaces/${invitationWorkspaceId}/members`,
    ),
  );
  invitationPartnerMembershipId = team.members.find(
    (member) => member.email === invitationPartner.email,
  )!.id;
});

test("E2E 3 — removed partner keeps account and loses workspace immediately", async ({
  browser,
}) => {
  const removal = await invitationOwner.api.delete(
    `/api/v1/workspaces/${invitationWorkspaceId}/members/${invitationPartnerMembershipId}`,
  );
  expect(removal.status()).toBe(204);
  expect((await invitationPartner.api.get("/api/v1/me")).status()).toBe(200);
  expect(
    (
      await invitationPartner.api.get(
        `/api/v1/workspaces/${invitationWorkspaceId}/bootstrap`,
      )
    ).status(),
  ).toBe(403);

  const state = await invitationPartner.api.storageState();
  const partnerContext = await browser.newContext({ storageState: state });
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/overview");
  await expect(partnerPage).toHaveURL(/\/onboarding/);
  await partnerContext.close();
});

test("E2E 4 — two users and two workspaces reject URL and write manipulation", async ({
  browser,
}) => {
  const accountA = await createVerifiedAccount("isolation-a");
  const accountB = await createVerifiedAccount("isolation-b");
  const workspaceA = await createWorkspace(accountA.api, "E2E Workspace A");
  const workspaceB = await createWorkspace(accountB.api, "E2E Workspace B");

  const listA = await apiData<Array<{ id: string }>>(
    await accountA.api.get("/api/v1/workspaces"),
  );
  expect(listA.map((workspace) => workspace.id)).toEqual([workspaceA]);
  expect(
    (
      await accountA.api.get(`/api/v1/workspaces/${workspaceB}/bootstrap`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await accountA.api.patch(`/api/v1/workspaces/${workspaceB}`, {
        data: { title: "Cross-write blocked", version: 1 },
      })
    ).status(),
  ).toBe(403);

  const browserContext = await browser.newContext({
    storageState: await accountA.api.storageState(),
  });
  const page = await browserContext.newPage();
  await page.goto("/overview");
  const browserStatus = await page.evaluate(
    async (id) =>
      fetch(`/api/v1/workspaces/${id}/bootstrap`, {
        credentials: "include",
      }).then((response) => response.status),
    workspaceB,
  );
  expect(browserStatus).toBe(403);
  await browserContext.close();
});

test("E2E 5 — two sessions, owned revoke and immediate denial", async () => {
  const first = await createVerifiedAccount("session-security");
  const second = await newApiContext();
  const login = await second.post("/api/v1/auth/sessions", {
    data: { email: first.email, password, remember: true },
    headers: { "User-Agent": "WeddingOS-E2E-Second" },
  });
  expect(login.status()).toBe(200);

  const sessions = await apiData<Array<{ id: string; current: boolean }>>(
    await first.api.get("/api/v1/me/sessions"),
  );
  expect(sessions).toHaveLength(2);
  const otherSession = sessions.find((session) => !session.current)!;
  expect(
    (await first.api.delete(`/api/v1/me/sessions/${otherSession.id}`)).status(),
  ).toBe(204);
  expect((await second.get("/api/v1/me")).status()).toBe(401);
  expect((await first.api.get("/api/v1/me")).status()).toBe(200);
});

test("E2E 6 — onboarding persists, completes honestly and projects activity", async () => {
  const account = await createVerifiedAccount("slice-2a-onboarding");
  const workspaceId = await createWorkspace(
    account.api,
    "Onboarding persistent E2E",
  );
  const initial = await apiData<{ version: number }>(
    await account.api.get(`/api/v1/workspaces/${workspaceId}/onboarding`),
  );
  const saved = await apiData<{ version: number }>(
    await account.api.patch(`/api/v1/workspaces/${workspaceId}/onboarding`, {
      headers: { "If-Match": `"${initial.version}"` },
      data: {
        currentStep: 8,
        couple: { confirmed: true, partnerOne: "Ana", partnerTwo: "Mihai" },
        dateEvents: { confirmed: true, date: "2027-09-12" },
        location: { confirmed: true, city: "Brașov" },
        guests: { confirmed: true, guestCount: "160" },
        budget: { confirmed: true, budget: "180000", currency: "RON" },
        style: { confirmed: true, styles: ["garden"] },
        existingProgress: { confirmed: true },
        planningPreferences: { confirmed: true, aiLevel: "echilibrat" },
      },
    }),
  );
  const completed = await apiData<{
    completed: true;
    planGeneration: string;
    message: string;
    jobId: string;
  }>(
    await account.api.post(
      `/api/v1/workspaces/${workspaceId}/onboarding/complete`,
      {
        headers: {
          "If-Match": `"${saved.version}"`,
          "Idempotency-Key": `complete-${crypto.randomUUID()}`,
        },
      },
    ),
  );
  expect(completed.planGeneration).toBe("not_started");
  expect(completed.message).toContain("Generarea planului urmează");
  await expect
    .poll(async () => {
      const job = await apiData<{ status: string }>(
        await account.api.get(`/api/v1/jobs/${completed.jobId}`),
      );
      return job.status;
    })
    .toBe("completed");
  const reloaded = await apiData<{ status: string; currentStep: number }>(
    await account.api.get(`/api/v1/workspaces/${workspaceId}/onboarding`),
  );
  expect(reloaded).toMatchObject({ status: "ready", currentStep: 8 });
  await expect
    .poll(async () => {
      const result = await apiData<{ items: Array<{ action: string }> }>(
        await account.api.get(`/api/v1/workspaces/${workspaceId}/activity`),
      );
      return result.items.map((item) => item.action);
    })
    .toContain("ready_for_plan_generation");
});

test("E2E 7 — demo controls stay inert and issue zero API requests", async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto("/sign-in");
  await page.evaluate(() => {
    document.cookie = "weddingos_demo=1; Path=/; Max-Age=28800; SameSite=Lax";
  });
  await page.goto("/team?demo=1");
  await expect(
    page.getByRole("button", { name: "Invită membru" }),
  ).toBeDisabled();
  await page.goto("/activity?demo=1");
  await expect(
    page.getByRole("button", { name: "Exportă CSV" }),
  ).toBeDisabled();
  expect(apiRequests).toEqual([]);
});

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = uniqueEmail(label);
  const registration = await api.post("/api/v1/auth/registrations", {
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
  const token = await waitForEmailToken(
    email,
    "Confirmă adresa de email WeddingOS",
  );
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", { data: { token } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await api.post("/api/v1/auth/sessions", {
        data: { email, password, remember: true },
      })
    ).status(),
  ).toBe(200);
  return { email, userId: registered.userId, api };
}

async function createWorkspace(
  api: APIRequestContext,
  title: string,
): Promise<string> {
  const response = await api.post("/api/v1/workspaces", {
    headers: { "Idempotency-Key": `e2e-${crypto.randomUUID()}` },
    data: { title, partnerOneName: "Ana", partnerTwoName: "Mihai" },
  });
  return (await apiData<{ id: string }>(response)).id;
}

async function newApiContext(): Promise<APIRequestContext> {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  retainedContexts.push(context);
  return context;
}

async function signInThroughUi(page: Page, email: string): Promise<void> {
  if (!page.url().includes("/sign-in")) await page.goto("/sign-in");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole("button", { name: "Conectează-te" }).click();
  await page.waitForURL(/\/(overview|onboarding)/);
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

async function waitForEmailToken(
  email: string,
  subject: string,
): Promise<string> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summaries = list.messages.filter(
      (message) =>
        message.Subject === subject &&
        message.To.some((recipient) => recipient.Address === email),
    );
    for (const summary of summaries) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Email token not delivered to ${email}`);
}

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
}
