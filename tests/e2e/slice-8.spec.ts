import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
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
let owner!: Account;
let outsider!: Account;
let workspaceId = "";
let eventId = "";
let plan!: Resource;
let itemA!: Resource;
let delayedItem!: Resource;
let blocker!: Resource;
let dependent!: Resource;
let checklist!: Resource;
let checklistItem!: Resource;
let contact!: Resource;
let incident!: Resource;
let announcement!: Resource;
let session!: Resource;
let station!: Resource;
let device!: Resource & { devicePublicId: string; deviceSecret: string };
let credential!: Resource & { token: string };
let householdId = "";
let secondHouseholdId = "";
let guestIds: string[] = [];
let declinedGuestId = "";
let offlineGuestId = "";
let guestToken = "";
let secondGuestToken = "";
let safeMoment!: Resource;
let rejectedMoment!: Resource;
let quarantinedMoment!: Resource;
let gallery!: Resource;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  owner = await createVerifiedAccount("slice8-owner");
  outsider = await createVerifiedAccount("slice8-outsider");
  workspaceId = (
    await createReadyWorkspace(owner.api, `Slice 8 E2E ${Date.now()}`)
  ).workspaceId;
  const calendar = await apiData<{
    items: Array<{ sourceType: string; sourceId: string }>;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/calendar-events`));
  eventId = calendar.items.find(
    (item) => item.sourceType === "wedding_event",
  )!.sourceId;
  const setup = await createGuestFixture();
  householdId = setup.householdId;
  secondHouseholdId = setup.secondHouseholdId;
  guestIds = setup.guestIds;
  declinedGuestId = setup.declinedGuestId;
  offlineGuestId = setup.offlineGuestId;
  guestToken = setup.guestToken;
  secondGuestToken = setup.secondGuestToken;
});

test.afterAll(async () => {
  await Promise.all(contexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("E2E 1 — Create Wedding Day Plan and persist Run of Show", async ({
  page,
}) => {
  await authorizePage(page, owner);
  await page.goto("/wedding-day");
  await expect(
    page.getByRole("heading", { name: "Ziua evenimentului", exact: true }),
  ).toBeVisible();
  plan = await createPlan();
  itemA = await createRunItem(
    "Primirea invitaților",
    "ARRIVAL",
    true,
    false,
    0,
  );
  await createRunItem("Ceremonia", "CEREMONY", true, true, 1);
  const loaded = await runOfShow();
  expect(loaded.items.map((item) => item.id)).toContain(itemA.id);
  await page.reload();
  await expect(page.getByText("Primirea invitaților")).toBeVisible();
});

test("E2E 2 — Publish immutable version and go live", async () => {
  plan = await patchResource(`/wedding-day/plans/${plan.id}`, plan.version, {
    summary: "Plan operațional validat",
  });
  plan = await postTransition(
    `/wedding-day/plans/${plan.id}/publish`,
    plan.version,
  );
  const immutable = await ownerDatabase.weddingDayPlanVersion.findUnique({
    where: { id: String(plan.publishedVersionId) },
  });
  expect(immutable?.immutable).toBe(true);
  plan = await postTransition(
    `/wedding-day/plans/${plan.id}/go-live`,
    plan.version,
  );
  expect(plan.status).toBe("LIVE");
  const command = await apiData<Record<string, unknown>>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/wedding-day/command-center`,
    ),
  );
  expect((command.plan as { status: string }).status).toBe("LIVE");
});

test("E2E 3 — Run of Show actual times persist", async () => {
  itemA = await transitionItem(itemA, "START");
  expect(itemA.status).toBe("IN_PROGRESS");
  itemA = await transitionItem(itemA, "COMPLETE");
  expect(itemA.status).toBe("COMPLETED");
  const loaded = (await runOfShow()).items.find(
    (item) => item.id === itemA.id,
  )!;
  expect(loaded.actualStartAt).toBeTruthy();
  expect(loaded.actualEndAt).toBeTruthy();
});

test("E2E 4 — Critical guest-visible delay reaches live state", async () => {
  delayedItem = await createRunItem(
    "Dansul mirilor",
    "ENTERTAINMENT",
    true,
    true,
    2,
  );
  delayedItem = await transitionItem(delayedItem, "START");
  delayedItem = await transitionItem(
    delayedItem,
    "MARK_DELAYED",
    "Program decalat",
    15,
  );
  expect(delayedItem.status).toBe("DELAYED");
  await expect
    .poll(
      async () =>
        (
          (await guestJson(
            `/api/v1/guest/wedding-day/live?token=${guestToken}`,
          )) as { events: Array<{ eventType: string }> }
        ).events.some(
          (event) => event.eventType === "wedding_day.item_delayed.v1",
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});

test("E2E 5 — Dependency blocks then releases downstream item", async () => {
  blocker = await createRunItem("Pregătire sală", "SETUP", false, false, 3);
  dependent = await createRunItem("Deschidere sală", "CUSTOM", false, false, 4);
  const dependencyUpdate = await apiData<{ version: number }>(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/wedding-day/run-of-show/items/${dependent.id}/dependencies`,
      {
        headers: mutationHeaders({ "If-Match": `"${dependent.version}"` }),
        data: {
          dependencies: [
            { itemId: blocker.id, dependencyType: "FINISH_TO_START" },
          ],
        },
      },
    ),
  );
  dependent = { ...dependent, version: dependencyUpdate.version };
  const blocked = await owner.api.post(
    `/api/v1/workspaces/${workspaceId}/wedding-day/run-of-show/items/${dependent.id}/transitions`,
    {
      headers: mutationHeaders({ "If-Match": `"${dependent.version}"` }),
      data: { transition: "START" },
    },
  );
  expect(blocked.status()).toBe(409);
  blocker = await transitionItem(blocker, "START");
  blocker = await transitionItem(blocker, "COMPLETE");
  dependent = await transitionItem(dependent, "START");
  expect(dependent.status).toBe("IN_PROGRESS");
});

test("E2E 6 — Operational checklist persists completion", async () => {
  checklist = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/checklists`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `checklist-${randomUUID()}`,
        }),
        data: { type: "VENUE_SETUP", title: "Deschidere locație", position: 0 },
      },
    ),
  );
  checklistItem = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/checklists/${checklist.id}/items`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `checklist-item-${randomUUID()}`,
        }),
        data: { title: "Verifică accesul", priority: "HIGH", position: 0 },
      },
    ),
  );
  checklistItem = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/checklist-items/${checklistItem.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${checklistItem.version}"` }),
        data: { transition: "COMPLETE" },
      },
    ),
  );
  expect(checklistItem.status).toBe("COMPLETED");
  expect(((await checklists())[0].items as Resource[])[0].status).toBe(
    "COMPLETED",
  );
});

test("E2E 7 — Encrypted operational contact CRUD", async () => {
  contact = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/contacts`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `contact-${randomUUID()}`,
        }),
        data: {
          type: "EMERGENCY",
          name: "Coordonator medical",
          role: "Prim ajutor",
          phone: "+373 60000000",
          notesPrivate: "Punct medical în foyer",
          priority: "CRITICAL",
          guestVisible: false,
        },
      },
    ),
  );
  const contacts = await apiData<{
    items: Array<Resource & { phone: string; notesPrivate: string }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/contacts`,
    ),
  );
  expect(contacts.items[0].phone).toBe("+373 60000000");
  const persisted = await ownerDatabase.weddingDayContact.findUnique({
    where: { id: contact.id },
  });
  expect(persisted?.phoneEncrypted).not.toContain("60000000");
});

test("E2E 8 — Incident update and resolution lifecycle", async () => {
  incident = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/incidents`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `incident-${randomUUID()}`,
        }),
        data: {
          type: "MEDICAL",
          severity: "CRITICAL",
          title: "Asistență medicală",
          descriptionPrivate: "Invitatul este asistat în foyer.",
        },
      },
    ),
  );
  await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/incidents/${incident.id}/updates`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `incident-update-${randomUUID()}`,
        }),
        data: { updateType: "NOTE", body: "Echipa medicală este prezentă." },
      },
    ),
  );
  incident = await transitionIncident(incident, "ACKNOWLEDGE");
  incident = await transitionIncident(
    incident,
    "RESOLVE",
    "Situație stabilizată",
  );
  expect(incident.status).toBe("RESOLVED");
});

test("E2E 9 — Incident privacy and tenant isolation", async () => {
  const own = await apiData<Resource>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/wedding-day/incidents/${incident.id}`,
    ),
  );
  expect(own.descriptionPrivate).toContain("foyer");
  const forbidden = await outsider.api.get(
    `/api/v1/workspaces/${workspaceId}/wedding-day/incidents/${incident.id}`,
  );
  expect(forbidden.status()).toBe(403);
  const guestLive = (await guestJson(
    `/api/v1/guest/wedding-day/live?token=${guestToken}`,
  )) as { events: Array<Record<string, unknown>> };
  expect(JSON.stringify(guestLive)).not.toContain("Invitatul este asistat");
});

test("E2E 10 — Audience-scoped announcement reaches only selected household", async () => {
  announcement = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/announcements`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `announcement-${randomUUID()}`,
        }),
        data: {
          title: "Intrare actualizată",
          body: "Folosiți intrarea de nord.",
          priority: "URGENT",
          channels: ["GUEST_COMPANION"],
          audiences: [
            { type: "HOUSEHOLDS", selector: { householdIds: [householdId] } },
          ],
        },
      },
    ),
  );
  announcement = await postTransition(
    `/wedding-day/announcements/${announcement.id}/publish`,
    announcement.version,
  );
  const first = (await guestJson(
    `/api/v1/guest/wedding-day/live?token=${guestToken}`,
  )) as { announcements: Array<{ id: string }> };
  const second = (await guestJson(
    `/api/v1/guest/wedding-day/live?token=${secondGuestToken}`,
  )) as { announcements: Array<{ id: string }> };
  expect(first.announcements.some((item) => item.id === announcement.id)).toBe(
    true,
  );
  expect(second.announcements.some((item) => item.id === announcement.id)).toBe(
    false,
  );
});

test("E2E 11 — Check-in session, station and device", async () => {
  session = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `session-${randomUUID()}`,
        }),
        data: {
          weddingEventId: eventId,
          planId: plan.id,
          name: "Acces principal",
          opensAt: "2027-09-12T08:00:00.000Z",
          closesAt: "2027-09-13T03:00:00.000Z",
          allowHouseholdCheckIn: true,
          allowManualLookup: true,
          allowOffline: true,
        },
      },
    ),
  );
  station = await apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/stations`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `station-${randomUUID()}`,
        }),
        data: { name: "Poarta A", location: "Intrarea de nord" },
      },
    ),
  );
  device = await apiData<typeof device>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/devices`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `device-${randomUUID()}`,
        }),
        data: { stationId: station.id, name: "Tabletă A" },
      },
    ),
  );
  expect(device.deviceSecret.length).toBeGreaterThan(32);
  session = await transitionSession("MARK_READY");
  session = await transitionSession("OPEN");
  expect(session.status).toBe("OPEN");
});

test("E2E 12 — Valid household QR check-in", async () => {
  credential = await createCredential(householdId);
  const validation = await apiData<{
    credentialStatus: string;
    guests: Array<{ id: string }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/validate`,
      { headers: mutationHeaders(), data: { token: credential.token } },
    ),
  );
  expect(validation.credentialStatus).toBe("ACTIVE");
  const result = await checkIn([guestIds[0]], credential.token);
  expect(result.results[0].outcome).toBe("ACCEPTED");
  expect(result.attendance.checkedInGuests).toBeGreaterThan(0);
});

test("E2E 13 — Duplicate QR does not create second canonical check-in", async () => {
  const result = await checkIn([guestIds[0]], credential.token);
  expect(result.results[0].outcome).toBe("DUPLICATE");
  expect(
    await ownerDatabase.guestCheckIn.count({
      where: { weddingEventId: eventId, guestId: guestIds[0] },
    }),
  ).toBe(1);
});

test("E2E 14 — Declined guest is denied and override requires reason", async () => {
  const denied = await checkIn([declinedGuestId], credential.token);
  expect(denied.results[0].outcome).toBe("DENIED");
  const missingReason = await owner.api.post(
    `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/check-ins`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `override-${randomUUID()}`,
      }),
      data: {
        commandId: randomUUID(),
        guestIds: [declinedGuestId],
        override: true,
      },
    },
  );
  expect(missingReason.status()).toBe(422);
  const overridden = await checkIn(
    [declinedGuestId],
    undefined,
    true,
    "Confirmat de coordonator",
  );
  expect(overridden.results[0].outcome).toBe("ACCEPTED");
});

test("E2E 15 — Household batch persists adults and child", async () => {
  const result = await checkIn(guestIds.slice(1, 3), credential.token);
  expect(
    result.results.filter((row) => row.outcome === "ACCEPTED"),
  ).toHaveLength(2);
  expect(
    await ownerDatabase.guestCheckIn.count({
      where: {
        weddingEventId: eventId,
        guestId: { in: guestIds.slice(1, 3) },
        status: "CHECKED_IN",
      },
    }),
  ).toBe(2);
});

test("E2E 16 — Check-out updates attendance", async () => {
  const result = await checkIn(
    [guestIds[1]],
    credential.token,
    false,
    undefined,
    true,
  );
  expect(result.results[0].status).toBe("CHECKED_OUT");
  expect(result.attendance.checkedOutGuests).toBeGreaterThan(0);
});

test("E2E 17 — Offline manifest and sync update canonical state", async () => {
  const manifest = await createManifest();
  const guest = manifest.guests.find((item) => item.id === offlineGuestId)!;
  const synced = await apiData<{ results: Array<{ outcome: string }> }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/offline-sync`,
      {
        headers: mutationHeaders({ "Idempotency-Key": `sync-${randomUUID()}` }),
        data: {
          devicePublicId: device.devicePublicId,
          deviceSecret: device.deviceSecret,
          snapshotId: manifest.id,
          snapshotVersion: manifest.version,
          commands: [
            {
              commandId: randomUUID(),
              guestId: offlineGuestId,
              credentialProof: guest.credentialProofs[0],
              action: "CHECK_IN",
              occurredAtDevice: new Date().toISOString(),
              localSequence: 1,
            },
          ],
        },
      },
    ),
  );
  expect(synced.results[0].outcome).toBe("ACCEPTED");
});

test("E2E 18 — Offline/online race remains one canonical record", async () => {
  const manifest = await createManifest();
  const guest = manifest.guests.find((item) => item.id === guestIds[0])!;
  const synced = await apiData<{ results: Array<{ outcome: string }> }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/offline-sync`,
      {
        headers: mutationHeaders({ "Idempotency-Key": `race-${randomUUID()}` }),
        data: {
          devicePublicId: device.devicePublicId,
          deviceSecret: device.deviceSecret,
          snapshotId: manifest.id,
          snapshotVersion: manifest.version,
          commands: [
            {
              commandId: randomUUID(),
              guestId: guestIds[0],
              credentialProof: guest.credentialProofs[0],
              action: "CHECK_IN",
              occurredAtDevice: new Date().toISOString(),
              localSequence: 2,
            },
          ],
        },
      },
    ),
  );
  expect(["DUPLICATE", "CONFLICT"]).toContain(synced.results[0].outcome);
  expect(
    await ownerDatabase.guestCheckIn.count({
      where: { weddingEventId: eventId, guestId: guestIds[0] },
    }),
  ).toBe(1);
});

test("E2E 19 — Revoked device cannot sync", async () => {
  const currentDevice =
    await ownerDatabase.guestCheckInDevice.findUniqueOrThrow({
      where: { id: device.id },
    });
  const response = await owner.api.post(
    `/api/v1/workspaces/${workspaceId}/check-in/devices/${device.id}/revoke`,
    {
      headers: mutationHeaders({ "If-Match": `"${currentDevice.version}"` }),
    },
  );
  expect(response.ok()).toBe(true);
  const sync = await owner.api.post(
    `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/offline-manifests`,
    {
      headers: mutationHeaders({
        "Idempotency-Key": `revoked-${randomUUID()}`,
      }),
      data: {
        devicePublicId: device.devicePublicId,
        deviceSecret: device.deviceSecret,
      },
    },
  );
  expect(sync.status()).toBe(403);
});

test("E2E 20 — Guest token and household QR isolation", async () => {
  const first = (await guestJson(
    `/api/v1/guest/check-in/credential?token=${guestToken}`,
  )) as { householdId: string; token: string };
  const second = (await guestJson(
    `/api/v1/guest/check-in/credential?token=${secondGuestToken}`,
  )) as { householdId: string; token: string };
  expect(first.householdId).toBe(householdId);
  expect(second.householdId).toBe(secondHouseholdId);
  expect(first.token).not.toBe(second.token);
  expect(
    (
      await fetch(
        `${apiUrl}/api/v1/guest/check-in/credential?token=${guestToken}x`,
      )
    ).status,
  ).toBe(401);
});

test("E2E 21 — Guest Moment image scans and can be approved", async () => {
  safeMoment = await uploadGuestMoment(
    validPng(),
    "image/png",
    "fotografie.png",
    "Imagine de la ceremonie",
  );
  safeMoment = await waitForMoment(safeMoment.id, "PENDING_REVIEW");
  safeMoment = await moderateMoment(safeMoment, "APPROVE");
  expect(safeMoment.status).toBe("APPROVED");
});

test("E2E 22 — Invalid media is quarantined and cannot be approved", async () => {
  quarantinedMoment = await uploadGuestMoment(
    Buffer.from("not-an-image"),
    "image/jpeg",
    "malicious.jpg",
    "Fișier invalid",
  );
  quarantinedMoment = await waitForMoment(quarantinedMoment.id, "REJECTED");
  expect(
    (quarantinedMoment.media as { moderationStatus: string }).moderationStatus,
  ).toBe("REJECTED");
  const approval = await owner.api.post(
    `/api/v1/workspaces/${workspaceId}/guest-moments/${quarantinedMoment.id}/transitions`,
    {
      headers: mutationHeaders({
        "If-Match": `"${quarantinedMoment.version}"`,
        "Idempotency-Key": `moderate-${randomUUID()}`,
      }),
      data: { transition: "APPROVE" },
    },
  );
  expect(approval.status()).toBe(409);
});

test("E2E 23 — Organizer rejection remains visible to uploader", async () => {
  rejectedMoment = await uploadGuestMoment(
    validPng(),
    "image/png",
    "respingere.png",
    "Moment de respins",
  );
  rejectedMoment = await waitForMoment(rejectedMoment.id, "PENDING_REVIEW");
  rejectedMoment = await moderateMoment(rejectedMoment, "REJECT");
  expect(rejectedMoment.status).toBe("REJECTED");
  const guestMoments = (await guestJson(
    `/api/v1/guest/moments?token=${guestToken}`,
  )) as { items: Array<{ id: string; status: string }> };
  expect(
    guestMoments.items.find((item) => item.id === rejectedMoment.id)?.status,
  ).toBe("REJECTED");
});

test("E2E 24 — Published gallery exposes only approved derivative", async () => {
  gallery = await apiData<Resource>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/galleries`, {
      headers: mutationHeaders({
        "Idempotency-Key": `gallery-${randomUUID()}`,
      }),
      data: {
        weddingEventId: eventId,
        name: "Galeria invitaților",
        visibility: "GUESTS_WITH_ACCESS",
        householdIds: [],
      },
    }),
  );
  gallery = await apiData<Resource>(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/galleries/${gallery.id}/items`,
      {
        headers: mutationHeaders({ "If-Match": `"${gallery.version}"` }),
        data: { guestMomentIds: [safeMoment.id] },
      },
    ),
  );
  gallery = await postTransition(
    `/galleries/${gallery.id}/publish`,
    gallery.version,
  );
  const published = (await guestJson(
    `/api/v1/guest/gallery?token=${secondGuestToken}`,
  )) as {
    items: Array<{
      id: string;
      items: Array<{ moment: { id: string } }>;
    }>;
  };
  expect(
    published.items
      .find((item) => item.id === gallery.id)
      ?.items.map((item) => item.moment.id),
  ).toContain(safeMoment.id);
  expect(JSON.stringify(published)).not.toContain(rejectedMoment.id);
});

test("E2E 25 — Guest report opens moderation evidence without deleting media", async () => {
  const report = await fetch(
    `${apiUrl}/api/v1/guest/moments/${safeMoment.id}/reports?token=${secondGuestToken}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `report-${randomUUID()}`,
        Origin: origin,
      },
      body: JSON.stringify({
        reason: "PRIVACY",
        details: "Solicit verificarea imaginii.",
      }),
    },
  );
  expect(report.ok).toBe(true);
  const organizer = await moments();
  expect(
    Number(organizer.find((item) => item.id === safeMoment.id)?.reportCount),
  ).toBeGreaterThan(0);
});

test("E2E 26 — Organizer and guest live projections are redacted", async () => {
  const organizer = await apiData<Record<string, unknown>>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/wedding-day/command-center`,
    ),
  );
  const guest = await guestJson(
    `/api/v1/guest/wedding-day/live?token=${guestToken}`,
  );
  expect((organizer.plan as { status: string }).status).toBe("LIVE");
  expect(JSON.stringify(guest)).not.toContain("descriptionPrivate");
  expect(JSON.stringify(guest)).toContain("wedding_day.item_delayed.v1");
});

test("E2E 27 — Overview and search use Wedding Day canonical data", async ({
  page,
}) => {
  const dashboard = await apiData<{
    weddingDay: {
      status: string;
      momentsDelayed: number;
      checkedInGuests: number;
    };
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(dashboard.weddingDay.status).toBe("LIVE");
  expect(dashboard.weddingDay.momentsDelayed).toBeGreaterThan(0);
  expect(dashboard.weddingDay.checkedInGuests).toBeGreaterThan(0);
  const search = await apiData<{ items: Array<{ type: string }> }>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/search?q=Dansul`),
  );
  expect(search.items.some((item) => item.type === "run_of_show_item")).toBe(
    true,
  );
  await authorizePage(page, owner);
  await page.goto("/overview");
  await expect(page.getByText("Wedding Day Command Center")).toBeVisible();
});

test("E2E 28 — Operational exports create secured artifacts", async () => {
  const requests = [
    { type: "RUN_SHEET", format: "xlsx", planId: plan.id, sessionId: null },
    { type: "CONTACT_SHEET", format: "csv", planId: plan.id, sessionId: null },
    {
      type: "CHECK_IN_MANIFEST",
      format: "xlsx",
      planId: null,
      sessionId: session.id,
    },
    {
      type: "ATTENDANCE",
      format: "csv",
      planId: null,
      sessionId: session.id,
    },
    { type: "INCIDENTS", format: "csv", planId: plan.id, sessionId: null },
  ] as const;
  for (const input of requests) {
    const requested = await apiData<{
      artifactId: string;
      job: { id: string };
    }>(
      await owner.api.post(
        `/api/v1/workspaces/${workspaceId}/wedding-day-exports`,
        {
          headers: mutationHeaders({
            "Idempotency-Key": `wedding-day-export-${input.type}-${randomUUID()}`,
          }),
          data: input,
        },
      ),
    );
    const completed = await waitForJob(requested.job.id);
    expect(completed.status).toBe("completed");
    const artifact = await owner.api.get(
      `/api/v1/jobs/${requested.job.id}/artifact`,
    );
    expect(artifact.status()).toBe(200);
    expect((await artifact.body()).byteLength).toBeGreaterThan(0);
    expect(artifact.headers()["content-type"]).toContain(
      input.format === "csv" ? "text/csv" : "spreadsheetml.sheet",
    );
  }
});

test("E2E 29 — Demo Wedding Day performs zero API mutations", async ({
  page,
}) => {
  await authorizePage(page, owner);
  let mutations = 0;
  page.on("request", (request) => {
    if (
      request.url().includes("/api/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    )
      mutations += 1;
  });
  await page.context().addCookies([
    {
      name: "weddingos_demo",
      value: "1",
      url: origin,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/wedding-day?demo=1");
  await expect(page.getByText(/demo/i).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(mutations).toBe(0);
});

async function createPlan() {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans`,
      {
        headers: mutationHeaders({ "Idempotency-Key": `plan-${randomUUID()}` }),
        data: {
          weddingEventId: eventId,
          name: "Operațiuni nuntă",
          title: "Wedding Day",
          summary: "Plan E2E",
          timezone: "Europe/Chisinau",
          operationalDate: "2027-09-12",
          settings: {},
        },
      },
    ),
  );
}

async function createRunItem(
  title: string,
  type: string,
  guestVisible: boolean,
  critical: boolean,
  position: number,
) {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/run-of-show/items`,
      {
        headers: mutationHeaders({ "Idempotency-Key": `run-${randomUUID()}` }),
        data: {
          type,
          title,
          plannedStartAt: new Date(
            Date.now() + (position + 1) * 60_000,
          ).toISOString(),
          plannedEndAt: new Date(
            Date.now() + (position + 2) * 60_000,
          ).toISOString(),
          priority: critical ? "CRITICAL" : "MEDIUM",
          position,
          isGuestVisible: guestVisible,
          isCritical: critical,
          requiresConfirmation: false,
          sourceType: "manual",
        },
      },
    ),
  );
}

async function runOfShow() {
  return apiData<{ items: Resource[] }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/run-of-show`,
    ),
  );
}

async function checklists() {
  return (
    await apiData<{ items: Resource[] }>(
      await owner.api.get(
        `/api/v1/workspaces/${workspaceId}/wedding-day/plans/${plan.id}/checklists`,
      ),
    )
  ).items;
}

async function transitionItem(
  item: Resource,
  transition: string,
  reason?: string,
  delayEstimateMinutes?: number,
) {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/run-of-show/items/${item.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${item.version}"` }),
        data: { transition, reason, delayEstimateMinutes },
      },
    ),
  );
}

async function transitionIncident(
  item: Resource,
  transition: string,
  reason?: string,
) {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/wedding-day/incidents/${item.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${item.version}"` }),
        data: { transition, reason },
      },
    ),
  );
}

async function transitionSession(transition: string) {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/transitions`,
      {
        headers: mutationHeaders({ "If-Match": `"${session.version}"` }),
        data: { transition },
      },
    ),
  );
}

async function postTransition(path: string, version: number) {
  return apiData<Resource>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}${path}`, {
      headers: mutationHeaders({
        "If-Match": `"${version}"`,
        "Idempotency-Key": `transition-${randomUUID()}`,
      }),
    }),
  );
}

async function patchResource(
  path: string,
  version: number,
  data: Record<string, unknown>,
) {
  return apiData<Resource>(
    await owner.api.patch(`/api/v1/workspaces/${workspaceId}${path}`, {
      headers: mutationHeaders({ "If-Match": `"${version}"` }),
      data,
    }),
  );
}

async function createCredential(targetHouseholdId: string) {
  return apiData<typeof credential>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/credentials`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `credential-${randomUUID()}`,
        }),
        data: {
          householdId: targetHouseholdId,
          guestId: null,
          credentialType: "HOUSEHOLD",
          expiresAt: "2027-09-13T06:00:00.000Z",
        },
      },
    ),
  );
}

async function checkIn(
  ids: string[],
  token?: string,
  override = false,
  overrideReason?: string,
  checkout = false,
) {
  return apiData<{
    results: Array<{ outcome: string; status: string }>;
    attendance: { checkedInGuests: number; checkedOutGuests: number };
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/${checkout ? "check-outs" : "check-ins"}`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `check-${randomUUID()}`,
        }),
        data: {
          commandId: randomUUID(),
          credentialToken: token,
          guestIds: ids,
          stationId: station.id,
          override,
          overrideReason,
        },
      },
    ),
  );
}

async function createManifest() {
  return apiData<{
    id: string;
    version: number;
    guests: Array<{ id: string; credentialProofs: string[] }>;
  }>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/check-in/sessions/${session.id}/offline-manifests`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `manifest-${randomUUID()}`,
        }),
        data: {
          devicePublicId: device.devicePublicId,
          deviceSecret: device.deviceSecret,
        },
      },
    ),
  );
}

async function uploadGuestMoment(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  caption: string,
) {
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const created = await guestFetch<{
    moment: Resource;
    upload: { url: string; headers: Record<string, string> };
  }>(`/api/v1/guest/moments?token=${guestToken}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `moment-${randomUUID()}`,
      Origin: origin,
    },
    body: JSON.stringify({
      weddingEventId: eventId,
      guestId: guestIds[0],
      caption,
      mediaType: "IMAGE",
      originalFileName: fileName,
      contentType,
      sizeBytes: bytes.length,
      checksumSha256: checksum,
    }),
  });
  const upload = await fetch(created.upload.url, {
    method: "PUT",
    headers: created.upload.headers,
    body: bytes,
  });
  expect(upload.ok).toBe(true);
  await guestFetch(
    `/api/v1/guest/moments/${created.moment.id}/complete?token=${guestToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ checksumSha256: checksum }),
    },
  );
  return created.moment;
}

async function waitForMoment(id: string, status: string) {
  let value!: Resource;
  await expect
    .poll(
      async () => {
        value = (await moments()).find((item) => item.id === id)!;
        return value?.status;
      },
      { timeout: 60_000 },
    )
    .toBe(status);
  return value;
}

async function moments() {
  return (
    await apiData<{ items: Resource[] }>(
      await owner.api.get(`/api/v1/workspaces/${workspaceId}/guest-moments`),
    )
  ).items;
}

async function moderateMoment(moment: Resource, transition: string) {
  return apiData<Resource>(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/guest-moments/${moment.id}/transitions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${moment.version}"`,
          "Idempotency-Key": `moderate-${randomUUID()}`,
        }),
        data: {
          transition,
          ...(transition === "REJECT"
            ? { reason: "Nu este potrivit pentru galerie" }
            : {}),
        },
      },
    ),
  );
}

function validPng() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGOoCDjxH4QZYAwAWBQKPQUDd/MAAAAASUVORK5CYII=",
    "base64",
  );
}

async function createGuestFixture() {
  const household = await createHousehold("Familia Live E2E");
  const secondHousehold = await createHousehold("Familia Izolată E2E");
  const guests = [
    await createGuest(household.id, "Ana", "Live", false),
    await createGuest(household.id, "Mihai", "Live", false),
    await createGuest(household.id, "Mara", "Live", true),
    await createGuest(household.id, "Ion", "Offline", false),
    await createGuest(household.id, "Radu", "Declined", false),
  ];
  await createGuest(secondHousehold.id, "Elena", "Izolată", false);
  const site = await ownerDatabase.invitationSite.create({
    data: {
      workspaceId,
      slug: `slice8-${Date.now()}-${randomUUID().slice(0, 6)}`,
      status: "PUBLISHED",
      defaultLanguage: "ro",
      availableLanguages: ["ro"],
      accessPolicy: "TOKEN_ONLY",
      publishedAt: new Date(),
    },
  });
  const version = await ownerDatabase.invitationVersion.create({
    data: {
      workspaceId,
      invitationSiteId: site.id,
      versionNumber: 1,
      document: {},
      settings: {},
      language: "ro",
      createdById: owner.userId,
      publishedAt: new Date(),
      contentHash: "a".repeat(64),
    },
  });
  await ownerDatabase.invitationSite.update({
    where: { id: site.id },
    data: { currentDraftVersionId: version.id, publishedVersionId: version.id },
  });
  const recipient = await ownerDatabase.invitationRecipient.create({
    data: {
      workspaceId,
      invitationSiteId: site.id,
      householdId: household.id,
      invitationVersionId: version.id,
      personalizationSnapshot: {},
      status: "SENT",
    },
  });
  const secondRecipient = await ownerDatabase.invitationRecipient.create({
    data: {
      workspaceId,
      invitationSiteId: site.id,
      householdId: secondHousehold.id,
      invitationVersionId: version.id,
      personalizationSnapshot: {},
      status: "SENT",
    },
  });
  const token = `guest_${randomUUID()}_${randomUUID()}`;
  const secondToken = `guest_${randomUUID()}_${randomUUID()}`;
  await ownerDatabase.guestAccessGrant.createMany({
    data: [
      {
        workspaceId,
        invitationRecipientId: recipient.id,
        householdId: household.id,
        tokenHash: sha256(token),
        expiresAt: new Date("2027-09-14T00:00:00.000Z"),
      },
      {
        workspaceId,
        invitationRecipientId: secondRecipient.id,
        householdId: secondHousehold.id,
        tokenHash: sha256(secondToken),
        expiresAt: new Date("2027-09-14T00:00:00.000Z"),
      },
    ],
  });
  const definition = await ownerDatabase.rsvpFormDefinition.create({
    data: { workspaceId, status: "PUBLISHED", createdById: owner.userId },
  });
  const form = await ownerDatabase.rsvpFormVersion.create({
    data: {
      workspaceId,
      formDefinitionId: definition.id,
      versionNumber: 1,
      config: {},
      contentHash: "b".repeat(64),
      immutable: true,
      createdById: owner.userId,
      publishedAt: new Date(),
    },
  });
  await ownerDatabase.rsvpFormDefinition.update({
    where: { id: definition.id },
    data: { currentDraftId: form.id, publishedVersionId: form.id },
  });
  const submission = await ownerDatabase.rsvpSubmission.create({
    data: {
      workspaceId,
      householdId: household.id,
      invitationRecipientId: recipient.id,
      formVersionId: form.id,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });
  await ownerDatabase.guestEventResponse.createMany({
    data: guests.map((guest, index) => ({
      workspaceId,
      submissionId: submission.id,
      guestId: guest.id,
      weddingEventId: eventId,
      attendance: index === 4 ? "DECLINED" : "CONFIRMED",
    })),
  });
  return {
    householdId: household.id,
    secondHouseholdId: secondHousehold.id,
    guestIds: guests.slice(0, 3).map((guest) => guest.id),
    offlineGuestId: guests[3].id,
    declinedGuestId: guests[4].id,
    guestToken: token,
    secondGuestToken: secondToken,
  };
}

async function createHousehold(name: string) {
  return apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/households`, {
      headers: mutationHeaders({
        "Idempotency-Key": `household-${randomUUID()}`,
      }),
      data: { name, preferredLanguage: "ro", side: "COMMON" },
    }),
  );
}

async function createGuest(
  targetHouseholdId: string,
  firstName: string,
  lastName: string,
  isChild: boolean,
) {
  return apiData<{ id: string }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/guests`, {
      headers: mutationHeaders({ "Idempotency-Key": `guest-${randomUUID()}` }),
      data: {
        householdId: targetHouseholdId,
        firstName,
        lastName,
        email: null,
        phone: null,
        preferredLanguage: "ro",
        side: "COMMON",
        isChild,
        dateOfBirth: isChild ? "2017-03-04" : undefined,
        isPlusOne: false,
        plusOneAllowed: false,
        needsTransport: false,
        needsAccommodation: false,
      },
    }),
  );
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function guestJson(path: string) {
  return guestFetch(path);
}

async function guestFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, init);
  const body = (await response.json()) as T & { detail?: string };
  expect(response.ok, `${response.status} ${body.detail ?? ""}`).toBe(true);
  return body;
}

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

async function createReadyWorkspace(api: APIRequestContext, title: string) {
  const workspace = await apiData<{ id: string }>(
    await api.post("/api/v1/workspaces", {
      headers: mutationHeaders({
        "Idempotency-Key": `workspace-${randomUUID()}`,
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
  await ownerDatabase.workspaceSubscription.upsert({
    where: { workspaceId: workspace.id },
    update: { planKey: "PRO", status: "ACTIVE", updatedById: owner.userId },
    create: {
      workspaceId: workspace.id,
      planKey: "PRO",
      status: "ACTIVE",
      createdById: owner.userId,
      updatedById: owner.userId,
    },
  });
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
        "Idempotency-Key": `complete-${randomUUID()}`,
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

async function waitForJob(jobId: string) {
  let value!: { status: string; error?: { message?: string } | null };
  await expect
    .poll(
      async () => {
        value = await apiData(await owner.api.get(`/api/v1/jobs/${jobId}`));
        return value.status;
      },
      { timeout: 60_000, message: value?.error?.message },
    )
    .toBe("completed");
  return value;
}
