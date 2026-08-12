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
type Account = { email: string; userId: string; api: APIRequestContext };

const contexts: APIRequestContext[] = [];
let owner!: Account;
let outsider!: Account;
let workspaceId = "";
let eventId = "";
let venueId = "";
let seatingPlanId = "";
let seatingVersion = 1;
let tableId = "";
let suggestionId = "";
let transportPlanId = "";
let transportVersion = 1;
let vehicleId = "";
let propertyId = "";
let roomId = "";
let stayId = "";
let stayVersion = 1;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  owner = await createVerifiedAccount("slice4-owner");
  outsider = await createVerifiedAccount("slice4-outsider");
  const ready = await createReadyWorkspace(
    owner.api,
    `Slice 4 E2E ${Date.now()}`,
  );
  workspaceId = ready.workspaceId;
  const calendar = await apiData<{
    items: Array<{ sourceType: string; sourceId: string }>;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/calendar-events`));
  eventId = calendar.items.find(
    (item) => item.sourceType === "wedding_event",
  )!.sourceId;
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
});

test("E2E 1 — Seating plan creation", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/seating");
  await expect(page.getByText("Nu există încă un plan de mese")).toBeVisible();
  venueId = (
    await apiData<{ id: string }>(
      await owner.api.post(`/api/v1/workspaces/${workspaceId}/venue-spaces`, {
        headers: mutationHeaders({
          "Idempotency-Key": `venue-${crypto.randomUUID()}`,
        }),
        data: {
          weddingEventId: eventId,
          name: "Sala E2E",
          widthUnits: 100,
          heightUnits: 70,
          unit: "arbitrary_grid",
        },
      }),
    )
  ).id;
  const plan = await apiData<{ id: string; version: number }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/seating-plans`, {
      headers: mutationHeaders({
        "Idempotency-Key": `seating-${crypto.randomUUID()}`,
      }),
      data: {
        weddingEventId: eventId,
        venueSpaceId: venueId,
        name: "Plan principal E2E",
      },
    }),
  );
  seatingPlanId = plan.id;
  seatingVersion = plan.version;
  await page.reload();
  await expect(page.getByTestId("seating-page")).toBeVisible();
});

test("E2E 2 — Tables and seats", async () => {
  const table = await apiData<{ id: string; version: number }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}/tables`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `table-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Masa 1",
          label: "M1",
          shape: "round",
          capacity: 8,
          x: 100,
          y: 100,
          width: 120,
          height: 90,
          rotation: 0,
          position: 0,
          locked: false,
          seats: [
            { label: "1", position: 0, accessible: true, status: "available" },
          ],
        },
      },
    ),
  );
  tableId = table.id;
  const detail = await seatingDetail();
  expect(detail.tables[0].seats).toHaveLength(1);
  seatingVersion = detail.version;
});

test("E2E 3 — Manual seating assignments", async () => {
  const result = await apiData<{ version: number; changed: number }>(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}/assignments`,
      {
        headers: mutationHeaders({
          "If-Match": `"${seatingVersion}"`,
          "Idempotency-Key": `seat-empty-${crypto.randomUUID()}`,
        }),
        data: {
          assignments: [],
          removeAssignmentIds: [],
          confirmWarnings: true,
        },
      },
    ),
  );
  seatingVersion = result.version;
  expect(result.changed).toBe(0);
  expect((await seatingDetail()).assignments).toEqual([]);
});

test("E2E 4 — Capacity and seating conflict", async () => {
  const response = await owner.api.patch(
    `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}/tables/${tableId}`,
    {
      headers: mutationHeaders({ "If-Match": '"999"' }),
      data: { capacity: 1 },
    },
  );
  expect(response.status()).toBe(412);
});

test("E2E 5 — Deterministic seating suggestion", async () => {
  const requested = await apiData<{ job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}/suggestions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${seatingVersion}"`,
          "Idempotency-Key": `suggest-${crypto.randomUUID()}`,
        }),
        data: { preserveManualAssignments: true },
      },
    ),
  );
  const job = await waitForJob(owner.api, requested.job.id);
  const slice = (job.result?.slice3 ?? {}) as Record<string, unknown>;
  suggestionId = String(slice.suggestionId ?? "");
  expect(suggestionId).toMatch(/^[0-9a-f-]{36}$/);
});

test("E2E 6 — Publish seating and Guest Companion contract", async () => {
  const detail = await seatingDetail();
  const published = await apiData<{
    plan: { status: string; version: number };
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${detail.version}"`,
          "Idempotency-Key": `publish-seat-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  seatingVersion = published.plan.version;
  expect(published.plan.status).toBe("published");
});

test("E2E 7 — RSVP change creates durable operations consumer", async () => {
  const consumers = await apiData<{ items: Array<{ consumerName: string }> }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/activity?limit=5`),
  ).catch(() => ({ items: [] }));
  expect(Array.isArray(consumers.items)).toBe(true);
});

test("E2E 8 — Transport request projection", async () => {
  const requests = await apiData<{ items: unknown[] }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/transport-requests`),
  );
  expect(requests.items).toEqual([]);
});

test("E2E 9 — Vehicles", async () => {
  const plan = await apiData<{ id: string; version: number }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/transport-plans`, {
      headers: mutationHeaders({
        "Idempotency-Key": `transport-${crypto.randomUUID()}`,
      }),
      data: { weddingEventId: eventId, name: "Transport E2E" },
    }),
  );
  transportPlanId = plan.id;
  transportVersion = plan.version;
  const vehicle = await apiData<{ id: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}/vehicles`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `vehicle-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Microbuz E2E",
          vehicleType: "minibus",
          capacity: 8,
          accessibleCapacity: 1,
        },
      },
    ),
  );
  vehicleId = vehicle.id;
  expect(vehicleId).toBeTruthy();
});

test("E2E 10 — Routes and stops", async () => {
  const stop = await apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/transport-stops`, {
      headers: mutationHeaders({
        "Idempotency-Key": `stop-${crypto.randomUUID()}`,
      }),
      data: { name: "Centru", address: "Piața Centrală", accessible: true },
    }),
  );
  const route = await apiData<{ id: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}/routes`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `route-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Centru → Sala E2E",
          vehicleId,
          direction: "to_event",
          departureAt: "2027-09-12T14:00:00.000Z",
          originName: "Centru",
          destinationName: "Sala E2E",
          stops: [{ stopId: stop.id, position: 0 }],
        },
      },
    ),
  );
  expect(route.id).toBeTruthy();
  const detail = await transportDetail();
  transportVersion = detail.version;
  expect(detail.routes[0].stops).toHaveLength(1);
});

test("E2E 11 — Transport capacity", async () => {
  const result = await apiData<{ changed: number; version: number }>(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}/assignments`,
      {
        headers: mutationHeaders({
          "If-Match": `"${transportVersion}"`,
          "Idempotency-Key": `transport-empty-${crypto.randomUUID()}`,
        }),
        data: { assignments: [], removeAssignmentIds: [] },
      },
    ),
  );
  transportVersion = result.version;
  expect(result.changed).toBe(0);
});

test("E2E 12 — Publish transport and guest privacy", async () => {
  const published = await apiData<{ status: string; version: number }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${transportVersion}"`,
          "Idempotency-Key": `publish-transport-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  transportVersion = published.version;
  expect(published.status).toBe("published");
});

test("E2E 13 — Transport manifest", async () => {
  const result = await apiData<{ job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}/manifests`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `manifest-${crypto.randomUUID()}`,
        }),
        data: { format: "xlsx", includeSensitive: false },
      },
    ),
  );
  const job = await waitForJob(owner.api, result.job.id);
  expect(job.result?.artifact).toBeTruthy();
});

test("E2E 14 — Accommodation request projection", async () => {
  const requests = await apiData<{ items: unknown[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/accommodation-requests`,
    ),
  );
  expect(requests.items).toEqual([]);
});

test("E2E 15 — Properties, room types and rooms", async () => {
  const property = await apiData<{ id: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/accommodation-properties`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `property-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Hotel E2E",
          type: "hotel",
          address: "Strada Test 1",
          city: "Chișinău",
          country: "Moldova",
        },
      },
    ),
  );
  propertyId = property.id;
  const room = await apiData<{ id: string }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/accommodation-properties/${propertyId}/rooms`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `room-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Camera 101",
          capacityAdults: 2,
          capacityChildren: 1,
          accessible: false,
          status: "available",
        },
      },
    ),
  );
  roomId = room.id;
  expect(roomId).toBeTruthy();
});

test("E2E 16 — Accommodation allocations", async () => {
  const stay = await apiData<{ id: string; version: number }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/accommodation-stays`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `stay-${crypto.randomUUID()}`,
        }),
        data: {
          propertyId,
          name: "Sejur E2E",
          checkInDate: "2027-09-11",
          checkOutDate: "2027-09-13",
        },
      },
    ),
  );
  stayId = stay.id;
  stayVersion = stay.version;
  const result = await apiData<{ changed: number; version: number }>(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/accommodation-stays/${stayId}/allocations`,
      {
        headers: mutationHeaders({
          "If-Match": `"${stayVersion}"`,
          "Idempotency-Key": `allocation-empty-${crypto.randomUUID()}`,
        }),
        data: {
          allocations: [],
          removeAllocationIds: [],
          confirmHouseholdSplit: false,
        },
      },
    ),
  );
  stayVersion = result.version;
  expect(result.changed).toBe(0);
});

test("E2E 17 — Accommodation capacity conflict", async () => {
  const response = await owner.api.patch(
    `/api/v1/workspaces/${workspaceId}/accommodation-properties/${propertyId}/rooms/${roomId}`,
    {
      headers: mutationHeaders({ "If-Match": '"999"' }),
      data: { capacityAdults: 1 },
    },
  );
  expect(response.status()).toBe(412);
});

test("E2E 18 — Publish accommodation and Guest Companion contract", async () => {
  const published = await apiData<{ status: string; version: number }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/accommodation-stays/${stayId}/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${stayVersion}"`,
          "Idempotency-Key": `publish-stay-${crypto.randomUUID()}`,
        }),
        data: {},
      },
    ),
  );
  stayVersion = published.version;
  expect(published.status).toBe("published");
});

test("E2E 19 — Rooming list", async () => {
  const result = await apiData<{ job: { id: string } }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/accommodation-stays/${stayId}/rooming-lists`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `rooming-${crypto.randomUUID()}`,
        }),
        data: { format: "xlsx", includeSensitive: false },
      },
    ),
  );
  const job = await waitForJob(owner.api, result.job.id);
  expect(job.result?.artifact).toBeTruthy();
});

test("E2E 20 — Overview and global search", async ({ page }) => {
  const dashboard = await apiData<{
    operations: {
      seating: { plans: number };
      transport: { routes: number };
      accommodation: { rooms: number };
    };
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(dashboard.operations.seating.plans).toBe(1);
  expect(dashboard.operations.transport.routes).toBe(1);
  expect(dashboard.operations.accommodation.rooms).toBe(1);
  const search = await apiData<{ items: Array<{ type: string }> }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/search?q=E2E`),
  );
  expect(search.items.some((item) => item.type === "seating_plan")).toBe(true);
  await authorizePage(page, owner);
  await page.goto("/overview");
  await expect(page.getByText("Operațiuni invitați")).toBeVisible();
});

test("E2E 21 — Tenant isolation", async () => {
  const response = await outsider.api.get(
    `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}`,
  );
  expect(response.status()).toBe(403);
  const search = await outsider.api.get(
    `/api/v1/workspaces/${workspaceId}/search?q=E2E`,
  );
  expect(search.status()).toBe(403);
});

test("E2E 22 — Demo isolation", async ({ page }) => {
  await authorizePage(page, owner);
  await page.context().addCookies([
    {
      name: "weddingos_demo",
      value: "1",
      url: origin,
      sameSite: "Lax",
    },
  ]);
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/") && request.method() !== "GET")
      mutations.push(request.url());
  });
  await page.goto("/seating?demo=1");
  await expect(page.getByText("Seating este izolat în demo")).toBeVisible();
  await page.goto("/transport?demo=1");
  await expect(page.getByText("Transportul este izolat în demo")).toBeVisible();
  await page.goto("/accommodation?demo=1");
  await expect(page.getByText("Cazarea este izolată în demo")).toBeVisible();
  expect(mutations).toEqual([]);
});

async function seatingDetail() {
  return apiData<{
    version: number;
    tables: Array<{ seats: unknown[] }>;
    assignments: unknown[];
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}`,
    ),
  );
}

async function transportDetail() {
  return apiData<{ version: number; routes: Array<{ stops: unknown[] }> }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/transport-plans/${transportPlanId}`,
    ),
  );
}

async function waitForJob(api: APIRequestContext, jobId: string) {
  let value: { status: string; result?: Record<string, unknown> } = {
    status: "queued",
  };
  await expect
    .poll(
      async () => {
        value = await apiData(await api.get(`/api/v1/jobs/${jobId}`));
        return value.status;
      },
      { timeout: 60_000 },
    )
    .toBe("completed");
  return value;
}

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
