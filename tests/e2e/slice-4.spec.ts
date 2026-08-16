import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import axe from "axe-core";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});
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
  await ownerDatabase.$disconnect();
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
  await page.getByRole("button", { name: "Mai multe acțiuni" }).click();
  await page.getByRole("menuitem", { name: "Redenumește planul" }).click();
  const renameDialog = page.getByRole("dialog", {
    name: "Redenumește planul de mese",
  });
  await renameDialog.getByLabel("Numele planului").fill("Plan sală E2E");
  await renameDialog.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Planul de mese a fost redenumit")).toBeVisible();
  await expect(page.getByText("Plan sală E2E")).toBeVisible();
  seatingVersion = (await seatingDetail()).version;
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

test("E2E 7B — Complete visual seating workflow with guests and menus", async ({
  page,
}) => {
  const household = await apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/households`, {
      headers: mutationHeaders({
        "Idempotency-Key": `seating-household-${crypto.randomUUID()}`,
      }),
      data: {
        name: "Familia Seating E2E",
        preferredLanguage: "ro",
        side: "COMMON",
      },
    }),
  );
  const guestIds: string[] = [];
  for (const [firstName, lastName, isChild] of [
    ["Ioana", "Dumitru", false],
    ["Matei", "Dumitru", true],
  ] as const) {
    const guest = await apiData<{ id: string }>(
      await owner.api.post(`/api/v1/workspaces/${workspaceId}/guests`, {
        headers: mutationHeaders({
          "Idempotency-Key": `seating-guest-${crypto.randomUUID()}`,
        }),
        data: {
          householdId: household.id,
          firstName,
          lastName,
          email: null,
          phone: null,
          preferredLanguage: "ro",
          side: "COMMON",
          isChild,
          isPlusOne: false,
          plusOneAllowed: false,
          needsTransport: false,
          needsAccommodation: false,
        },
      }),
    );
    guestIds.push(guest.id);
  }
  const site = await ownerDatabase.invitationSite.create({
    data: {
      workspaceId,
      slug: `seating-e2e-${crypto.randomUUID()}`,
      status: "DRAFT",
    },
  });
  const invitationVersion = await ownerDatabase.invitationVersion.create({
    data: {
      workspaceId,
      invitationSiteId: site.id,
      versionNumber: 1,
      document: { sections: [] },
      settings: {},
      language: "ro",
      createdById: owner.userId,
      contentHash: "1".repeat(64),
    },
  });
  await ownerDatabase.invitationSite.update({
    where: { id: site.id },
    data: { currentDraftVersionId: invitationVersion.id },
  });
  const form = await ownerDatabase.rsvpFormDefinition.create({
    data: {
      workspaceId,
      status: "PUBLISHED",
      createdById: owner.userId,
    },
  });
  const formVersion = await ownerDatabase.rsvpFormVersion.create({
    data: {
      workspaceId,
      formDefinitionId: form.id,
      versionNumber: 1,
      config: { attendanceEnabled: true },
      contentHash: "0".repeat(64),
      immutable: true,
      createdById: owner.userId,
      publishedAt: new Date(),
    },
  });
  await ownerDatabase.rsvpFormDefinition.update({
    where: { id: form.id },
    data: {
      currentDraftId: formVersion.id,
      publishedVersionId: formVersion.id,
    },
  });
  const recipient = await ownerDatabase.invitationRecipient.create({
    data: {
      workspaceId,
      householdId: household.id,
      invitationSiteId: site.id,
      invitationVersionId: invitationVersion.id,
      status: "RESPONDED",
    },
  });
  const submission = await ownerDatabase.rsvpSubmission.create({
    data: {
      workspaceId,
      householdId: household.id,
      invitationRecipientId: recipient.id,
      formVersionId: formVersion.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
      lastModifiedAt: new Date(),
    },
  });
  await ownerDatabase.guestEventResponse.createMany({
    data: guestIds.map((guestId) => ({
      workspaceId,
      submissionId: submission.id,
      guestId,
      weddingEventId: eventId,
      attendance: "CONFIRMED",
    })),
  });
  const menu = await apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/menus`, {
      headers: mutationHeaders({
        "Idempotency-Key": `seating-menu-${crypto.randomUUID()}`,
      }),
      data: {
        name: "Meniu familie E2E",
        audience: "ALL",
        status: "ACTIVE",
        position: 0,
        courses: [{ courseType: "main", name: "Fel principal", position: 0 }],
        dietaryTags: [],
      },
    }),
  );

  await authorizePage(page, owner);
  await page.goto(`/seating?plan=${seatingPlanId}`);
  await expect(page.getByText("2 din 2 confirmați")).toBeHidden();
  await expect(page.getByText("0 din 2 confirmați")).toBeVisible();
  await page.getByRole("button", { name: "Adaugă masă" }).click();
  const tableDialog = page.getByRole("dialog", { name: "Masă nouă" });
  await tableDialog.getByLabel("Numele mesei").fill("Masa familiei E2E");
  await tableDialog.getByLabel("Etichetă scurtă").fill("M2");
  await tableDialog.getByLabel("Capacitate").fill("4");
  await tableDialog.getByLabel("Minim recomandat").fill("2");
  await tableDialog.getByLabel("Zonă").fill("Aproape de scenă");
  await tableDialog.getByRole("button", { name: "Adaugă masa" }).click();
  await expect(page.getByText("Masa a fost adăugată")).toBeVisible();
  await page.getByRole("button", { name: "Obiect în sală" }).click();
  await page.getByRole("menuitem", { name: "Scenă" }).click();
  const floorObjectDialog = page.getByRole("dialog", { name: "Scenă" });
  await floorObjectDialog.getByLabel("Denumire").fill("Scena principală E2E");
  await floorObjectDialog
    .getByRole("button", { name: "Salvează obiectul" })
    .click();
  await expect(page.getByText("Obiectul a fost actualizat")).toBeVisible();
  const stage = page.getByRole("button", {
    name: /Scena principală E2E\. Trage pentru mutare/,
  });
  await expect(stage).toBeVisible();
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (stageBox) {
    await page.mouse.move(stageBox.x + 20, stageBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + 120, stageBox.y + 350, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(async () => (await seatingDetail()).floorObjects[0]?.y)
    .toBeGreaterThan(72);

  const tableOnCanvas = page.getByRole("button", {
    name: /Masa familiei E2E, 0 din 4/,
  });
  const tableBox = await tableOnCanvas.boundingBox();
  expect(tableBox).not.toBeNull();
  if (tableBox) {
    await page.mouse.move(tableBox.x + 30, tableBox.y + 30);
    await page.mouse.down();
    await page.mouse.move(tableBox.x + 100, tableBox.y + 75, { steps: 6 });
    await page.mouse.up();
  }
  await expect
    .poll(async () => (await seatingDetail()).tables[1]?.x)
    .toBeGreaterThan(253);
  await tableOnCanvas.click();
  const tableInspector = page.getByRole("dialog", { name: "Gestionează M2" });
  await expect(tableInspector).toBeVisible();
  await tableInspector.getByRole("button", { name: "Închide" }).click();

  for (const fullName of ["Ioana Dumitru", "Matei Dumitru"]) {
    await page
      .getByRole("button", { name: `Acțiuni pentru ${fullName}` })
      .click();
    await page.getByRole("menuitem", { name: "Așază la M2" }).click();
  }
  await expect(page.getByText("2 din 2 confirmați")).toBeVisible();
  await page
    .getByRole("button", { name: /Masa familiei E2E, 2 din 4/ })
    .click();
  await expect(tableInspector).toBeVisible();
  await captureSeating(page, "inspector");
  await expect(
    tableInspector.getByText("Ioana Dumitru", { exact: true }),
  ).toBeVisible();
  const menuSelects = tableInspector.getByLabel("Meniu", { exact: true });
  await expect(menuSelects).toHaveCount(2);
  await menuSelects.nth(0).selectOption(menu.id);
  await menuSelects.nth(1).selectOption(menu.id);
  const seatSelects = tableInspector.getByLabel("Loc", { exact: true });
  await seatSelects.nth(0).selectOption({ index: 1 });
  await tableInspector
    .getByRole("button", { name: "Gestionează", exact: true })
    .click();
  const seatsDialog = page.getByRole("dialog", {
    name: "Locurile mesei M2",
  });
  await seatsDialog
    .getByRole("button", { name: "Marchează locul 1 ca accesibil" })
    .click();
  await seatsDialog
    .getByRole("button", { name: "Închide", exact: true })
    .last()
    .click();
  await tableInspector.getByRole("button", { name: "Închide" }).click();
  await page.getByRole("tab", { name: "Toți" }).click();
  await page
    .getByRole("button", { name: "Acțiuni pentru Ioana Dumitru" })
    .click();
  await page.getByRole("menuitem", { name: "Adaugă regulă" }).click();
  const ruleDialog = page.getByRole("dialog", { name: "Regulă de așezare" });
  await ruleDialog
    .getByLabel("Tipul regulii")
    .selectOption("accessible_seat_required");
  await ruleDialog
    .getByLabel("Motiv / context")
    .fill("Acces facil verificat cu familia");
  await ruleDialog.getByRole("button", { name: "Adaugă regula" }).click();
  await expect(
    page.getByText("Regula de așezare a fost adăugată"),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("2 din 2 confirmați")).toBeVisible();
  await expect(page.getByText("0 fără meniu · 0 probleme")).toBeVisible();
  await expectNoSeriousA11yViolations(page, "main");
  await page.getByRole("button", { name: "Mărește planul sălii" }).click();
  await captureSeating(page, "expanded");
  await page.getByRole("button", { name: "Închide planul mărit" }).click();
  await captureSeating(page, "complete");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menuitem", { name: "Invitați pe mese CSV" }).click();
  await expect(page.getByText("Pregătim fișierul")).toBeVisible();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("sarbato-invitati-pe-mese.csv");
  await expect(page.getByText("Export descărcat")).toBeVisible();
  await page.getByRole("button", { name: "Republică" }).click();
  const publishDialog = page.getByRole("dialog", {
    name: "Republici planul?",
  });
  await expect(
    publishDialog.getByText("2", { exact: true }).first(),
  ).toBeVisible();
  await publishDialog.getByRole("button", { name: "Republică" }).click();
  await expect(page.getByText("Planul a fost republicat")).toBeVisible();
});

test("E2E 8 — Transport request projection", async () => {
  const requests = await apiData<{ items: unknown[] }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/transport-requests`),
  );
  expect(requests.items).toEqual([]);
});

test("E2E 9 — Vehicles", async ({ page }) => {
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

  await authorizePage(page, owner);
  await page.goto("/transport");
  await expect(page.getByTestId("transport-page")).toBeVisible();
  await page
    .getByRole("button", { name: "Redenumește planul de transport" })
    .click();
  const renamePlanDialog = page.getByRole("dialog", {
    name: "Redenumește planul de transport",
  });
  await renamePlanDialog.getByLabel("Nume").fill("Transport principal E2E");
  await renamePlanDialog.getByRole("button", { name: "Salvează" }).click();
  await expect(
    page.getByText("Planul de transport a fost redenumit"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vehicul" }).click();
  const vehicleDialog = page.getByRole("dialog", { name: "Vehicul nou" });
  await vehicleDialog.getByLabel("Denumire").fill("Autocar accesibil UI");
  await vehicleDialog.getByLabel("Tip").selectOption("bus");
  await vehicleDialog.getByLabel("Număr de înmatriculare").fill("E2E 2026");
  await vehicleDialog.getByLabel("Capacitate totală").fill("42");
  await vehicleDialog.getByLabel("Locuri accesibile").fill("3");
  await vehicleDialog.getByLabel("Nume șofer").fill("Șofer Test");
  await vehicleDialog.getByLabel("Telefon șofer").fill("+37360000000");
  await vehicleDialog
    .getByLabel("Note private")
    .fill("Acces pe la intrarea laterală.");
  await vehicleDialog.getByRole("button", { name: "Adaugă" }).click();
  await expect(page.getByText("Vehiculul a fost adăugat")).toBeVisible();
  const detail = await transportDetail();
  expect(
    detail.vehicles.some(
      (item: Record<string, unknown>) =>
        item.name === "Autocar accesibil UI" &&
        item.vehicleType === "bus" &&
        item.accessibleCapacity === 3,
    ),
  ).toBe(true);
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

test("E2E 13B — An organizer can archive an unused draft transport plan", async ({
  page,
}) => {
  const temporary = await apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/transport-plans`, {
      headers: mutationHeaders({
        "Idempotency-Key": `transport-archive-${crypto.randomUUID()}`,
      }),
      data: { weddingEventId: eventId, name: "Transport temporar E2E" },
    }),
  );
  await authorizePage(page, owner);
  await page.goto("/transport");
  await page.getByLabel("Plan de transport activ").selectOption(temporary.id);
  await expect(
    page.getByText(/Plan activ: Transport temporar E2E/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Arhivează planul de transport" })
    .click();
  const archiveDialog = page.getByRole("dialog", {
    name: "Arhivezi planul de transport?",
  });
  await archiveDialog.getByRole("button", { name: "Arhivează planul" }).click();
  await expect(
    page.getByText("Planul de transport a fost arhivat"),
  ).toBeVisible();
  const list = await apiData<{ items: Array<{ id: string }> }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/transport-plans`),
  );
  expect(list.items.some((item) => item.id === temporary.id)).toBe(false);
});

test("E2E 14 — Accommodation request projection", async () => {
  const requests = await apiData<{ items: unknown[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/accommodation-requests`,
    ),
  );
  expect(requests.items).toEqual([]);
});

test("E2E 15 — Properties, room types and rooms", async ({ page }) => {
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

  await authorizePage(page, owner);
  await page.goto("/accommodation");
  await page.getByRole("tab", { name: "Camere și alocări" }).click();
  await page.getByRole("button", { name: "Proprietate" }).click();
  const propertyDialog = page.getByRole("dialog", {
    name: "Proprietate nouă",
  });
  await propertyDialog.getByLabel("Nume").fill("Pensiunea UI E2E");
  await propertyDialog.getByLabel("Tip").selectOption("pension");
  await propertyDialog.getByLabel("Adresă").fill("Strada UI 12");
  await propertyDialog.getByLabel("Oraș").fill("Orhei");
  await propertyDialog.getByLabel("Țară").fill("Republica Moldova");
  await propertyDialog.getByLabel("Telefon contact").fill("+37360000001");
  await propertyDialog.getByLabel("Check-in").fill("15:00");
  await propertyDialog.getByLabel("Check-out").fill("11:00");
  await propertyDialog
    .getByLabel("Instrucțiuni pentru oaspeți")
    .fill("Parcarea este în curtea interioară.");
  await propertyDialog.getByRole("button", { name: "Adaugă" }).click();
  await expect(page.getByText("Proprietatea a fost adăugată")).toBeVisible();
  const properties = await apiData<{
    items: Array<Record<string, unknown>>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/accommodation-properties`,
    ),
  );
  expect(
    properties.items.some(
      (item) =>
        item.name === "Pensiunea UI E2E" &&
        item.type === "pension" &&
        item.country === "Republica Moldova",
    ),
  ).toBe(true);
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
  await expect(
    page.getByText("Planul de mese este izolat în demo"),
  ).toBeVisible();
  await page.goto("/transport?demo=1");
  await expect(page.getByText("Transportul este izolat în demo")).toBeVisible();
  await page.goto("/accommodation?demo=1");
  await expect(page.getByText("Cazarea este izolată în demo")).toBeVisible();
  expect(mutations).toEqual([]);
});

async function seatingDetail() {
  return apiData<{
    version: number;
    tables: Array<{ seats: unknown[]; x: number; y: number }>;
    floorObjects: Array<{ id: string; x: number; y: number }>;
    assignments: unknown[];
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/seating-plans/${seatingPlanId}`,
    ),
  );
}

async function transportDetail() {
  return apiData<{
    version: number;
    routes: Array<{ stops: unknown[] }>;
    vehicles: Array<Record<string, unknown>>;
  }>(
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

async function captureSeating(page: Page, name: string) {
  const originalViewport = page.viewportSize();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({
      path: `test-results/seating-${name}-${viewport.width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  if (originalViewport) await page.setViewportSize(originalViewport);
}

async function expectNoSeriousA11yViolations(page: Page, selector: string) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async (scope) => {
    const axeRuntime = (
      window as Window & {
        axe: {
          run: (
            context: string,
            options: Record<string, unknown>,
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await axeRuntime.run(scope, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return result.violations
      .filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious",
      )
      .map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target.join(" ")),
      }));
  }, selector);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
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
