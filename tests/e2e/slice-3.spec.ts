import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { createHmac } from "node:crypto";
import axe from "axe-core";
import { PrismaClient } from "@weddingos/database";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const webhookSecret = "weddingos-local-outbox-encryption-key-change-production";
const ownerDatabase = new PrismaClient({
  datasourceUrl:
    "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public",
});

type Account = { email: string; userId: string; api: APIRequestContext };
type Guest = {
  id: string;
  householdId: string;
  firstName: string;
  lastName: string;
  version: number;
};

const retainedContexts: APIRequestContext[] = [];
let owner!: Account;
let workspaceId = "";
let householdId = "";
let primaryGuest!: Guest;
let childGuest!: Guest;
let invitationVersionId = "";
let recipientId = "";
let guestToken = "";
let menuId = "";
let campaignId = "";
let importId = "";

test.describe.configure({ mode: "serial" });

async function captureInvitationV2(
  page: Page,
  name: string,
  viewports: Array<{ width: number; height: number }> = [
    { width: 1440, height: 1000 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ],
) {
  const originalViewport = page.viewportSize();
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    if (name === "editor") {
      const preview =
        viewport.width >= 1024
          ? "Previzualizare desktop"
          : viewport.width >= 640
            ? "Previzualizare tabletă"
            : "Previzualizare mobilă";
      await page.getByRole("radio", { name: preview }).click();
      await expect(
        page.locator('[data-invitation-renderer="true"]'),
      ).toBeVisible();
    }
    if (name === "campaign-list") {
      await page
        .getByRole("heading", { name: "Campanii e-mail" })
        .scrollIntoViewIfNeeded();
    }
    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      const urls = Array.from(document.querySelectorAll<HTMLElement>("*"))
        .flatMap((element) =>
          Array.from(
            getComputedStyle(element).backgroundImage.matchAll(
              /url\(["']?([^"')]+)["']?\)/g,
            ),
          ).map((match) => match[1]),
        )
        .filter((url, index, values) => values.indexOf(url) === index);
      await Promise.all(
        urls.map(
          (url) =>
            new Promise<void>((resolve) => {
              const image = new Image();
              image.onload = () => resolve();
              image.onerror = () => resolve();
              image.src = url;
              if (image.complete) resolve();
            }),
        ),
      );
    });
    await page.waitForTimeout(450);
    await page.screenshot({
      path: `test-results/invitation-v2-${name}-${viewport.width}.png`,
      animations: "disabled",
    });
    if (name === "guest-open" && viewport.width === 390) {
      await page.screenshot({
        path: "test-results/invitation-v2-guest-open-full-390.png",
        animations: "disabled",
        fullPage: true,
      });
    }
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
              help: string;
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
        help: violation.help,
        targets: violation.nodes.map((node) => node.target.join(" ")),
      }));
  }, selector);
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function enterRsvpPage(page: Page) {
  await expect(
    page.getByText("Confirmarea familiei", { exact: true }),
  ).toBeVisible();
}

test.beforeAll(async () => {
  owner = await createVerifiedAccount("slice3-e2e-owner");
  workspaceId = await createReadyWorkspace(
    owner.api,
    `Slice 3 E2E ${Date.now()}`,
  );
});

test.afterAll(async () => {
  await Promise.all(retainedContexts.map((context) => context.dispose()));
  await ownerDatabase.$disconnect();
});

test("E2E 1 — Add household and guests", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/guests");
  await page.getByRole("button", { name: "Gospodărie" }).click();
  const householdDialog = page.getByRole("dialog", {
    name: "Gospodărie nouă",
  });
  await householdDialog.locator('input[name="name"]').fill("Familia Pop E2E");
  await householdDialog.locator('input[name="city"]').fill("Chișinău");
  await householdDialog.getByRole("button", { name: "Creează" }).click();
  await expect(page.getByText("Gospodărie creată")).toBeVisible();

  const households = await apiData<{
    items: Array<{ id: string; name: string }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/households?search=Familia%20Pop%20E2E`,
    ),
  );
  householdId = households.items.find(
    (item) => item.name === "Familia Pop E2E",
  )!.id;

  const addGuestButton = page.getByRole("button", {
    name: "Invitat",
    exact: true,
  });
  await expect(addGuestButton).toBeEnabled();
  await addGuestButton.click();
  const guestDialog = page.getByRole("dialog", { name: "Invitat nou" });
  await guestDialog.locator('input[name="firstName"]').fill("Ana");
  await guestDialog.locator('input[name="lastName"]').fill("Pop");
  await guestDialog.locator('input[name="email"]').fill(owner.email);
  await guestDialog.getByRole("button", { name: "Adaugă" }).click();
  const desktopGuest = page
    .locator("table")
    .getByText("Ana Pop", { exact: true });
  await expect(desktopGuest).toBeVisible();

  primaryGuest = (await guestList("Ana")).items[0]!;
  await desktopGuest.click();
  await page.getByLabel("Permite plus-unu").check();
  await page
    .getByRole("button", { name: "Salvează profilul", exact: true })
    .click();
  await expect(page.getByText("Invitat actualizat")).toBeVisible();
  primaryGuest = (await guestList("Ana")).items[0]!;

  await page.getByRole("button", { name: "Gospodărie" }).click();
  const secondHouseholdDialog = page.getByRole("dialog", {
    name: "Gospodărie nouă",
  });
  await secondHouseholdDialog
    .locator('input[name="name"]')
    .fill("Familia Ionescu E2E");
  await secondHouseholdDialog.getByRole("button", { name: "Creează" }).click();
  await expect(secondHouseholdDialog).toBeHidden();
  const secondHouseholds = await apiData<{
    items: Array<{ id: string; name: string }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/households?search=Familia%20Ionescu%20E2E`,
    ),
  );
  const secondHouseholdId = secondHouseholds.items[0]!.id;

  await expect(addGuestButton).toBeEnabled();
  await addGuestButton.click();
  const secondAdultDialog = page.getByRole("dialog", { name: "Invitat nou" });
  await secondAdultDialog.locator('input[name="firstName"]').fill("Elena");
  await secondAdultDialog.locator('input[name="lastName"]').fill("Pop");
  await secondAdultDialog
    .locator('select[name="householdId"]')
    .selectOption(secondHouseholdId);
  await secondAdultDialog.getByLabel("Permite adăugarea unui plus-unu").check();
  await secondAdultDialog.getByRole("button", { name: "Adaugă" }).click();
  await expect(secondAdultDialog).toBeHidden();
  await expect(
    page.locator("table").getByText("Elena Pop", { exact: true }),
  ).toBeVisible();
  const secondAdult = (await guestList("Elena")).items[0]!;

  await page.getByRole("button", { name: "Gestionează etichete" }).click();
  let tagDialog = page.getByRole("dialog", { name: "Gestionează etichetele" });
  await tagDialog.getByLabel("Etichetă nouă").fill("Familie apropiată E2E");
  await tagDialog.getByLabel("Culoare").fill("#7c3aed");
  await tagDialog.getByRole("button", { name: "Creează" }).click();
  await expect(page.getByText("Etichetă creată")).toBeVisible();
  await page.getByRole("button", { name: "Gestionează etichete" }).click();
  tagDialog = page.getByRole("dialog", { name: "Gestionează etichetele" });
  await tagDialog
    .getByRole("button", { name: "Editează eticheta Familie apropiată E2E" })
    .click();
  const editTagDialog = page.getByRole("dialog", { name: "Editează eticheta" });
  await editTagDialog.getByLabel("Nume").fill("Familie VIP E2E");
  await editTagDialog.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Etichetă actualizată")).toBeVisible();
  await page.getByRole("button", { name: "Gestionează etichete" }).click();
  tagDialog = page.getByRole("dialog", { name: "Gestionează etichetele" });
  await tagDialog
    .getByRole("button", { name: "Șterge eticheta Familie VIP E2E" })
    .click();
  const deleteTagDialog = page.getByRole("dialog", {
    name: "Ștergi eticheta?",
  });
  await deleteTagDialog
    .getByRole("button", { name: "Șterge eticheta" })
    .click();
  await expect(page.getByText("Etichetă ștearsă")).toBeVisible();
  await tagDialog.getByText("Închide", { exact: true }).click();

  await expect(addGuestButton).toBeEnabled();
  await addGuestButton.click();
  const childDialog = page.getByRole("dialog", { name: "Invitat nou" });
  await childDialog.locator("select").first().selectOption("child");
  await childDialog.locator('input[name="firstName"]').fill("Mara");
  await childDialog.locator('input[name="lastName"]').fill("Pop");
  await childDialog
    .locator('select[name="householdId"]')
    .selectOption(householdId);
  await childDialog.locator('input[name="dateOfBirth"]').fill("2017-03-04");
  await childDialog.getByRole("button", { name: "Adaugă" }).click();
  await expect(childDialog).toBeHidden();
  await expect(
    page.locator("table").getByText("Mara Pop", { exact: true }),
  ).toBeVisible();
  childGuest = (await guestList("Mara")).items[0]!;

  await expect(addGuestButton).toBeEnabled();
  await addGuestButton.click();
  const plusOneDialog = page.getByRole("dialog", { name: "Invitat nou" });
  await plusOneDialog.locator("select").first().selectOption("plus_one");
  await plusOneDialog.locator('input[name="firstName"]').fill("Radu");
  await plusOneDialog.locator('input[name="lastName"]').fill("Ionescu");
  await plusOneDialog.locator("select").nth(1).selectOption(secondAdult.id);
  await plusOneDialog.getByRole("button", { name: "Adaugă" }).click();
  await expect(plusOneDialog).toBeHidden();
  await expect(
    page.locator("table").getByText("Radu Ionescu", { exact: true }),
  ).toBeVisible();
  const listed = await guestList();
  expect(listed.summary.people.children).toBe(1);
  expect(listed.summary.people.plusOnes).toBe(1);
  expect(listed.items.map((item) => item.id)).toEqual(
    expect.arrayContaining([primaryGuest.id, childGuest.id]),
  );
});

test("E2E 2 — Import", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/guests");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/workspaces/${workspaceId}/guest-imports`) &&
      response.request().method() === "POST",
  );
  await page.locator('input[type="file"]').setInputFiles({
    name: "invitati-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `firstName,lastName,email,household\nIon,Rusu,ion-${Date.now()}@example.test,Familia Rusu\nAna,Pop,${owner.email},Familia Pop E2E\n`,
    ),
  });
  const upload = await responsePromise;
  expect(upload.ok()).toBe(true);
  const uploaded = (await upload.json()) as {
    data: { import: { id: string }; job: { id: string } };
  };
  importId = uploaded.data.import.id;
  await waitForJob(owner.api, uploaded.data.job.id);
  await expect(page.getByText("Fișier analizat")).toBeVisible({
    timeout: 60_000,
  });
  const review = page.getByRole("dialog", {
    name: "Revizuire import invitați",
  });
  await expect(review).toBeVisible();
  await expect(review.getByLabel("Coloană Prenume")).toHaveValue("firstName");
  await expect(review.getByText("Duplicat găsit")).toBeVisible();
  await review.getByRole("button", { name: "Confirmă maparea" }).click();
  await expect(page.getByText("Coloane confirmate")).toBeVisible();
  await review.getByLabel("Decizie rând 3").selectOption("MERGE_WITH_EXISTING");
  await review.getByRole("button", { name: "Aplică importul" }).click();
  await expect(page.getByText("Import finalizat")).toBeVisible();
  await expect(
    page.locator("table").getByText("Ion Rusu", { exact: true }),
  ).toBeVisible();
  const status = await waitForImport(importId, "completed");
  expect(status.committedRows).toBeGreaterThan(0);
});

test("E2E 3 — Create and publish invitation", async ({ page }) => {
  const form = await saveRsvpForm(futureIso(30));
  await publishRsvpForm(form.version);

  await authorizePage(page, owner);
  await page.goto("/rsvp");
  await page.getByRole("button", { name: "Întrebările formularului" }).click();
  const rsvpDialog = page.getByRole("dialog", {
    name: "Întrebările formularului pentru invitați",
  });
  await rsvpDialog
    .getByRole("switch", { name: "Alergii și restricții alimentare" })
    .click();
  await rsvpDialog.getByRole("button", { name: "Salvează ciorna" }).click();
  await expect(
    page.getByText("Ciorna formularului a fost salvată"),
  ).toBeVisible();
  let persistedForm = await apiData<{
    draft: { config: { allergyCollection: boolean } } | null;
    published: { config: { allergyCollection: boolean } } | null;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/rsvp-form`));
  expect(persistedForm.draft?.config.allergyCollection).toBe(false);

  await page.getByRole("button", { name: "Întrebările formularului" }).click();
  await page
    .getByRole("dialog", {
      name: "Întrebările formularului pentru invitați",
    })
    .getByRole("switch", { name: "Alergii și restricții alimentare" })
    .click();
  await page
    .getByRole("dialog", {
      name: "Întrebările formularului pentru invitați",
    })
    .getByRole("button", { name: "Salvează ciorna" })
    .click();
  await page.getByRole("button", { name: "Publică acum" }).click();
  await expect(
    page.getByText("Formularul pentru invitați este actualizat"),
  ).toBeVisible();
  persistedForm = await apiData<{
    draft: { config: { allergyCollection: boolean } } | null;
    published: { config: { allergyCollection: boolean } } | null;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/rsvp-form`));
  expect(
    (persistedForm.published ?? persistedForm.draft)?.config.allergyCollection,
  ).toBe(true);

  await page.goto("/invitations/editor");
  const zoomLevel = page.getByRole("button", {
    name: "Revino la dimensiunea reală de 100%",
  });
  await expect(zoomLevel).toHaveText(/^Auto · \d+%$/);
  await expect(zoomLevel).not.toHaveText("100%");
  const canvasViewport = await page
    .getByTestId("invitation-canvas-scroll")
    .boundingBox();
  const zoomToolbar = await page
    .getByTestId("invitation-zoom-toolbar")
    .boundingBox();
  expect(canvasViewport).not.toBeNull();
  expect(zoomToolbar).not.toBeNull();
  expect(zoomToolbar!.x).toBeGreaterThanOrEqual(canvasViewport!.x);
  expect(zoomToolbar!.x + zoomToolbar!.width).toBeLessThanOrEqual(
    canvasViewport!.x + canvasViewport!.width + 1,
  );
  await page.getByRole("button", { name: "Mărește previzualizarea" }).click();
  await expect(zoomLevel).not.toHaveText(/^Auto/);
  const preferredDesktopZoom = await zoomLevel.textContent();
  await page.reload();
  await expect(zoomLevel).toHaveText(preferredDesktopZoom!);
  await page.getByRole("radio", { name: "Previzualizare tabletă" }).click();
  await expect(zoomLevel).toHaveText(/^Auto · \d+%$/);
  await page.getByRole("radio", { name: "Previzualizare desktop" }).click();
  await expect(zoomLevel).toHaveText(preferredDesktopZoom!);
  await page
    .getByRole("button", {
      name: "Încadrează automat previzualizarea în spațiul disponibil",
    })
    .click();
  await expect(zoomLevel).toHaveText(/^Auto · \d+%$/);
  const studioTools = page.getByRole("complementary", {
    name: "Instrumentele studioului",
  });
  await expect(studioTools).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Structura invitației" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Inspectorul invitației" }),
  ).toBeVisible();
  await studioTools.getByRole("button", { name: "Plic" }).click();
  await page.getByRole("button", { name: /^Plic animat/ }).click();
  await studioTools.getByRole("button", { name: "Design" }).click();
  await expect(page.getByText("Paleta invitației")).toBeVisible();
  const initialPaletteSize = await page
    .getByLabel(/^Modifică culoarea \d+$/)
    .count();
  await page
    .getByRole("button", { name: "Adaugă o culoare în paletă" })
    .click();
  await expect(page.getByLabel(/^Modifică culoarea \d+$/)).toHaveCount(
    initialPaletteSize + 1,
  );
  const addedAccent = page.getByRole("button", {
    name: "Aplică #8A5A83 drept accent principal",
  });
  await addedAccent.click();
  await expect(addedAccent).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: `Șterge culoarea ${initialPaletteSize + 1}` })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Aplică #F06449 drept accent principal",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const editorDrawer = page.getByRole("dialog", {
    name: "Editează invitația",
  });
  if (await editorDrawer.isVisible()) {
    await editorDrawer.getByRole("button", { name: "Închide" }).click();
  }
  await page.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Ciornă salvată")).toBeVisible();
  await replaceInvitationStarterContent();
  await page.reload();
  await page.getByRole("button", { name: "Publică", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publici invitația?" });
  await dialog.getByRole("button", { name: "Publică" }).click();
  await expect(page.getByText("Invitația a fost publicată")).toBeVisible();
  await captureInvitationV2(page, "editor");

  const site = await invitationSite();
  expect(site.status).toBe("published");
  invitationVersionId = site.published!.id;

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileNames = page
    .locator('[data-invitation-content-key="names"]')
    .first();
  await mobileNames.scrollIntoViewIfNeeded();
  await mobileNames.click();
  await expect(mobileNames).toHaveAttribute("contenteditable", "false");
  const mobileInspector = page.locator(
    'section[aria-label="Ajustări pentru elementul selectat"]',
  );
  await expect(mobileInspector).toBeHidden();
  await page
    .getByRole("navigation", {
      name: "Instrumente rapide pentru invitație",
    })
    .getByRole("button", { name: "Editează", exact: true })
    .click();
  await expect(mobileInspector).toBeVisible();
  await expect(
    mobileInspector.getByRole("combobox", {
      name: "Dispozitive pentru ajustare",
    }),
  ).toHaveValue("mobile");
  await mobileInspector
    .getByRole("button", { name: "Extinde panoul de ajustări" })
    .click();
  await expect(
    mobileInspector.getByRole("button", {
      name: "Micșorează panoul de ajustări",
    }),
  ).toBeVisible();
});

test("E2E 4 — Create recipients", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/invitations");
  await page
    .getByRole("button", { name: "Pregătește destinatari", exact: true })
    .click();
  const prepareDialog = page.getByRole("dialog", {
    name: "Pregătește destinatarii",
  });
  await prepareDialog
    .getByRole("button", { name: "Pregătește accesurile" })
    .click();
  await expect(page.getByText("Destinatari pregătiți")).toBeVisible();
  await captureInvitationV2(page, "distribution");
  const recipients = await apiData<{
    items: Array<{ id: string; householdId: string }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/invitation-recipients`,
    ),
  );
  recipientId = recipients.items.find(
    (recipient) => recipient.householdId === householdId,
  )!.id;
  expect(recipientId).toBeTruthy();
  await expect(
    page.getByText(`${recipients.items.length} destinatari`, { exact: true }),
  ).toBeVisible();
});

test("E2E 5 — Send campaign", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/invitations");
  await page.getByRole("button", { name: "Campanie nouă" }).click();
  const dialog = page.getByRole("dialog", { name: "Campanie e-mail nouă" });
  const name = `Invitația principală E2E ${Date.now()}`;
  const subject = `Invitație E2E ${Date.now()}`;
  await dialog.locator('input[name="name"]').fill(name);
  await dialog.locator('input[name="subject"]').fill(subject);
  await dialog
    .locator('textarea[name="body"]')
    .fill("Te așteptăm alături de noi.");
  await dialog.getByRole("button", { name: "Salvează ciorna" }).click();
  await expect(page.locator("table").getByText(name)).toBeVisible();
  const campaigns = await apiData<{
    items: Array<{ id: string; name: string }>;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/campaigns`));
  campaignId = campaigns.items.find((campaign) => campaign.name === name)!.id;
  const audience = await apiData<{ valid: number }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/campaigns/${campaignId}/audience-preview`,
    ),
  );
  expect(audience.valid).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Trimite" }).click();
  const sendDialog = page.getByRole("dialog", {
    name: "Confirmă distribuirea",
  });
  await expect(
    sendDialog.getByText(String(audience.valid), { exact: true }).first(),
  ).toBeVisible();
  await sendDialog
    .getByRole("button", {
      name: `Trimite pentru ${audience.valid} ${audience.valid === 1 ? "destinatar" : "destinatari"}`,
    })
    .click();
  await expect(page.getByText("Livrare pusă în coadă")).toBeVisible();

  await waitForCampaign(campaignId, "completed");
  const message = await waitForCampaignEmail(subject, owner.email);
  guestToken = message.token;
  expect(guestToken.length).toBeGreaterThan(32);
  expect(message.html).toContain("Un plic pentru tine");
  expect(message.html).toContain("Deschide plicul în browser");
  expect(message.html).not.toContain("<script>");

  await page.reload();
  await captureInvitationV2(page, "campaign-list");
  const campaignRow = page.getByRole("row").filter({ hasText: name });
  await campaignRow.getByRole("button", { name: "Detalii livrare" }).click();
  const deliveryDialog = page.getByRole("dialog", {
    name: `Livrarea campaniei „${name}”`,
  });
  await expect(
    deliveryDialog.getByText("Acceptat de furnizor").first(),
  ).toBeVisible();
  const maskedAddresses = deliveryDialog.getByText(/\*\*\*@/);
  await expect(maskedAddresses).toHaveCount(audience.valid);
  await expect(maskedAddresses.first()).toBeVisible();
  await captureInvitationV2(page, "campaign-delivery");
});

test("E2E 6 — Guest opens invitation", async ({ page }) => {
  const operationalRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/guest\/(event-day|check-in|moments|gallery)/.test(request.url()))
      operationalRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`/guest?token=${encodeURIComponent(guestToken)}`);
  await expect(
    page.getByRole("button", { name: "Deschide plicul" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "O invitație pentru voi" }),
  ).toHaveAttribute("data-reveal-style", "envelope");
  await expectNoSeriousA11yViolations(page, '[role="dialog"]');
  const nocturneArtwork = await page.request.get(
    "/invitation-art/nocturne-glass.webp",
  );
  expect(nocturneArtwork.ok()).toBe(true);
  expect(nocturneArtwork.headers()["content-type"]).toContain("image/webp");
  await captureInvitationV2(page, "guest-cover");
  const recipientBeforeReveal = await apiData<{
    items: Array<{ id: string; status: string }>;
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/invitation-recipients`,
    ),
  );
  expect(
    recipientBeforeReveal.items.find((item) => item.id === recipientId)?.status,
  ).not.toBe("opened");

  const letter = page.locator("[data-reveal-letter]");
  const closedLetter = await letter.boundingBox();
  expect(closedLetter).not.toBeNull();
  await page.getByRole("button", { name: "Deschide plicul" }).click();
  await page.waitForTimeout(760);
  const movingLetter = await letter.boundingBox();
  expect(movingLetter).not.toBeNull();
  expect(movingLetter!.y).toBeLessThan(closedLetter!.y - 8);
  await page.screenshot({
    path: "test-results/invitation-v3-envelope-opening-mid.png",
    animations: "allow",
  });
  await expect(page.locator('[data-invitation-renderer="true"]')).toBeVisible({
    timeout: 5_000,
  });
  await expect(
    page.getByRole("button", { name: "Revede introducerea" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Confirmarea familiei", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Bine ai venit, Familia Pop E2E")).toHaveCount(0);
  expect(operationalRequests).toEqual([]);
  await expectNoSeriousA11yViolations(
    page,
    '[data-invitation-renderer="true"]',
  );
  await captureInvitationV2(page, "guest-open");
  const rsvpLink = page
    .locator('[data-invitation-renderer="true"] a[href*="/guest/rsvp"]')
    .first();
  await expect(rsvpLink).toBeVisible();
  await rsvpLink.click();
  await expect(page).toHaveURL(/\/guest\/rsvp\?token=/);
  await enterRsvpPage(page);
  await expect(page.getByText("Ana Pop", { exact: true })).toBeVisible();
  await expect(page.getByText("Mara Pop", { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const recipient = await apiData<{
        items: Array<{ id: string; status: string }>;
      }>(
        await owner.api.get(
          `/api/v1/workspaces/${workspaceId}/invitation-recipients`,
        ),
      );
      return recipient.items.find((item) => item.id === recipientId)?.status;
    })
    .toBe("opened");
});

test("E2E 7 — Household RSVP", async ({ page }) => {
  menuId = (
    await apiData<{ id: string }>(
      await owner.api.post(`/api/v1/workspaces/${workspaceId}/menus`, {
        headers: mutationHeaders({
          "Idempotency-Key": `menu-${crypto.randomUUID()}`,
        }),
        data: {
          name: "Meniu clasic E2E",
          audience: "ALL",
          status: "ACTIVE",
          position: 0,
          courses: [{ courseType: "main", name: "Fel principal", position: 0 }],
          dietaryTags: ["vegetarian"],
        },
      }),
    )
  ).id;
  await page.goto(`/guest/rsvp?token=${encodeURIComponent(guestToken)}`);
  await enterRsvpPage(page);
  const selects = page.getByRole("combobox");
  await expect(selects.first()).toBeVisible();
  let attendanceCount = 0;
  let menuCount = 0;
  for (let index = 0; index < (await selects.count()); index += 1) {
    const select = selects.nth(index);
    const values = await select
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value),
      );
    if (values.includes("CONFIRMED")) {
      attendanceCount += 1;
      await select.selectOption("CONFIRMED");
    } else if (values.includes(menuId)) {
      menuCount += 1;
      await select.selectOption(menuId);
    }
  }
  expect(attendanceCount).toBeGreaterThan(0);
  expect(menuCount).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Salvează RSVP" }).click();
  await expect(page.getByText("Răspuns salvat")).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Confirmarea familiei", { exact: true }),
  ).toBeVisible();
  const rsvp = await publicJson<{ responses: Array<{ attendance: string }> }>(
    `/api/v1/guest/rsvp?token=${encodeURIComponent(guestToken)}`,
  );
  expect(rsvp.responses.length).toBeGreaterThanOrEqual(6);
  expect(
    rsvp.responses.every((response) => response.attendance === "confirmed"),
  ).toBe(true);

  await authorizePage(page, owner);
  await page.goto("/rsvp");
  await expect(
    page.getByRole("heading", { name: "Răspunsuri invitați" }),
  ).toBeVisible();
  await expect(page.getByText("Răspunsuri pe gospodării")).toBeVisible();
  await page.getByLabel("Caută invitat sau gospodărie").fill("Familia Pop");
  await expect(page.getByText("1 rezultate")).toBeVisible();
  await expectNoSeriousA11yViolations(page, "main");
  await captureInvitationV2(page, "rsvp-dashboard");

  await page.getByLabel("Deschide răspunsurile pentru Familia Pop E2E").click();
  await expect(
    page.getByRole("dialog", { name: "Familia Pop E2E" }),
  ).toBeVisible();
  await expect(page.getByText("Meniu clasic E2E").first()).toBeVisible();
  await captureInvitationV2(page, "rsvp-detail");
  await page.getByRole("button", { name: "Corectează răspunsul" }).click();
  await page
    .getByLabel("Motivul corectării")
    .fill("Confirmare verificată telefonic în testul complet");
  await page.getByRole("button", { name: "Salvează corectarea" }).click();
  await expect(page.getByText("Răspunsul a fost corectat")).toBeVisible();

  await page.getByRole("button", { name: "Întrebările formularului" }).click();
  const formDialog = page.getByRole("dialog", {
    name: "Întrebările formularului pentru invitați",
  });
  await expect(formDialog).toBeVisible();
  await captureInvitationV2(page, "rsvp-form");
  await formDialog
    .getByRole("button", { name: "Închide", exact: true })
    .click();

  await page.getByRole("button", { name: "Trimite reamintire" }).click();
  const reminderDialog = page.getByRole("dialog", {
    name: "Confirmă reamintirea",
  });
  await expect(reminderDialog).toBeVisible();
  await captureInvitationV2(page, "rsvp-reminder");
  await reminderDialog
    .getByRole("button", { name: "Închide", exact: true })
    .click();
  await expect(reminderDialog).toBeHidden();
});

test("E2E 8 — Plus-one", async ({ page }) => {
  const initialPlusOnes = (await guestList()).summary.people.plusOnes;
  await page.goto(`/guest/rsvp?token=${encodeURIComponent(guestToken)}`);
  await enterRsvpPage(page);
  await page.getByRole("checkbox", { name: "Vin cu un însoțitor" }).click();
  await page
    .getByLabel("Prenumele însoțitorului", { exact: true })
    .fill("Alex");
  await page
    .getByLabel("Numele însoțitorului", { exact: true })
    .fill("Ionescu");
  await page.getByRole("button", { name: "Salvează RSVP" }).click();
  await expect(page.getByText("Răspuns salvat")).toBeVisible();
  await expect
    .poll(async () => (await guestList()).summary.people.plusOnes)
    .toBe(initialPlusOnes + 1);
  expect((await guestList("Alex")).items[0]?.isPlusOne).toBe(true);
});

test("E2E 9 — Modify RSVP", async ({ page }) => {
  await page.goto(`/guest/rsvp?token=${encodeURIComponent(guestToken)}`);
  await enterRsvpPage(page);
  const select = page
    .locator("select")
    .filter({ has: page.locator('option[value="UNSURE"]') })
    .first();
  await select.selectOption("UNSURE");
  await page.getByRole("button", { name: "Salvează RSVP" }).click();
  await expect(page.getByText("Răspuns salvat")).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator("select")
      .filter({ has: page.locator('option[value="UNSURE"]') })
      .first(),
  ).toHaveValue("UNSURE");
});

test("E2E 10 — Deadline closed", async ({ page }) => {
  const closed = await saveRsvpForm(
    new Date(Date.now() - 86_400_000).toISOString(),
  );
  await publishRsvpForm(closed.version);
  await page.goto(`/guest/rsvp?token=${encodeURIComponent(guestToken)}`);
  await enterRsvpPage(page);
  await expect(page.getByText("Închis", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvează RSVP" }),
  ).toBeDisabled();

  const reopened = await saveRsvpForm(futureIso(30));
  await publishRsvpForm(reopened.version);
});

test("E2E 11 — Reminder", async () => {
  const reminderHousehold = await createHousehold("Familia Reminder E2E");
  const reminderEmail = uniqueEmail("slice3-reminder");
  await createGuest({
    householdId: reminderHousehold.id,
    firstName: "Radu",
    lastName: "Reminder",
    email: reminderEmail,
  });
  await apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/invitation-recipients`,
      {
        headers: mutationHeaders({
          "Idempotency-Key": `recipient-reminder-${crypto.randomUUID()}`,
        }),
        data: {
          householdIds: [reminderHousehold.id],
          guestIds: [],
          invitationVersionId,
        },
      },
    ),
  );
  const subject = `Reamintire RSVP E2E ${Date.now()}`;
  const campaign = await createCampaign(subject, "RSVP_REMINDER");
  await sendCampaign(campaign.id, campaign.version);
  await waitForCampaign(campaign.id, "completed");
  expect(
    (await waitForCampaignEmail(subject, reminderEmail)).messageId,
  ).toBeTruthy();
});

test("E2E 12 — Menu and allergy", async ({ page }) => {
  await page.goto(`/guest/rsvp?token=${encodeURIComponent(guestToken)}`);
  await enterRsvpPage(page);
  const attendanceSelects = page
    .locator("select")
    .filter({ has: page.locator('option[value="CONFIRMED"]') });
  const attendanceCount = await attendanceSelects.count();
  expect(attendanceCount).toBeGreaterThan(0);
  for (let index = 0; index < attendanceCount; index += 1) {
    await attendanceSelects.nth(index).selectOption("CONFIRMED");
  }
  const primaryCard = page.getByText("Ana Pop", { exact: true }).locator("..");
  await primaryCard.locator("textarea").fill("arahide");
  await page.getByRole("button", { name: "Salvează RSVP" }).click();
  await expect(page.getByText("Răspuns salvat")).toBeVisible();
  const issues = await apiData<{
    items: Array<{ id: string; status: string }>;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/allergy-issues`));
  expect(issues.items.some((issue) => issue.status === "unreviewed")).toBe(
    true,
  );
  const selections = await apiData<{ items: Array<{ menuId: string }> }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/guest-menu-selections`,
    ),
  );
  expect(
    selections.items.some((selection) => selection.menuId === menuId),
  ).toBe(true);
  await authorizePage(page, owner);
  await page.goto("/menus");
  await expect(
    page.getByText("Meniuri & alergii", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Meniu clasic E2E", { exact: true }),
  ).toBeVisible();
});

test("E2E 13 — Guest export", async () => {
  const exported = await apiData<{ job: { id: string } }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/guest-exports`, {
      headers: mutationHeaders({
        "Idempotency-Key": `export-${crypto.randomUUID()}`,
      }),
      data: {
        format: "xlsx",
        includeContactData: true,
        includeRsvp: true,
        includeMenu: true,
        includeAllergies: true,
        includeLogistics: true,
      },
    }),
  );
  await waitForJob(owner.api, exported.job.id);
  const download = await owner.api.get(
    `/api/v1/jobs/${exported.job.id}/artifact`,
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect((await download.body()).byteLength).toBeGreaterThan(100);
});

test("E2E 14 — Campaign partial failure", async () => {
  const previousGuestToken = guestToken;
  const subject = `Campanie partială E2E ${Date.now()}`;
  const campaign = await createCampaign(subject, "INVITATION");
  await sendCampaign(campaign.id, campaign.version);
  await waitForCampaign(campaign.id, "completed");
  const message = await waitForCampaignEmail(subject, owner.email);
  guestToken = message.token;
  expect(guestToken).not.toBe(previousGuestToken);
  const anonymousApi = await playwrightRequest.newContext({ baseURL: apiUrl });
  try {
    expect(
      (
        await anonymousApi.get(
          `/api/v1/guest/bootstrap?token=${encodeURIComponent(previousGuestToken)}`,
        )
      ).status(),
    ).toBe(401);
  } finally {
    await anonymousApi.dispose();
  }
  const payload = {
    eventId: `provider-${crypto.randomUUID()}`,
    messageId: message.messageId,
    type: "failed",
    occurredAt: new Date().toISOString(),
  };
  const webhook = await owner.api.post("/api/v1/webhooks/email/smtp", {
    headers: {
      "x-weddingos-signature": createHmac("sha256", webhookSecret)
        .update(JSON.stringify(payload))
        .digest("hex"),
    },
    data: payload,
  });
  expect(webhook.status()).toBe(201);
  const partial = await waitForCampaign(campaign.id, "partial");
  await sendCampaign(partial.id, partial.version, "RETRY_FAILED");
  await waitForCampaign(campaign.id, "completed");
  const recipients = await apiData<{ items: Array<{ status: string }> }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/campaigns/${campaign.id}/recipients`,
    ),
  );
  expect(
    recipients.items.some((recipient) => recipient.status === "failed"),
  ).toBe(false);
});

test("E2E 15 — Tenant isolation", async () => {
  const outsider = await createVerifiedAccount("slice3-e2e-outsider");
  const otherWorkspace = await createReadyWorkspace(
    outsider.api,
    `Izolare Slice 3 ${Date.now()}`,
  );
  expect(
    (
      await outsider.api.get(`/api/v1/workspaces/${workspaceId}/guests`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.api.get(`/api/v1/workspaces/${otherWorkspace}/campaigns`)
    ).status(),
  ).toBe(403);
  expect(
    (
      await outsider.api.patch(
        `/api/v1/workspaces/${workspaceId}/guests/${primaryGuest.id}`,
        {
          headers: mutationHeaders({ "If-Match": `"${primaryGuest.version}"` }),
          data: { firstName: "Atac" },
        },
      )
    ).status(),
  ).toBe(403);
});

test("E2E 16 — Guest token isolation", async () => {
  const invitation = await publicJson<Record<string, unknown>>(
    `/api/v1/guest/invitation?token=${encodeURIComponent(guestToken)}`,
  );
  expect(invitation).toHaveProperty("invitation");
  expect(invitation).not.toHaveProperty("rsvp");
  expect(invitation).not.toHaveProperty("operations");
  expect(invitation).not.toHaveProperty("accommodationRecommendations");
  expect(invitation.household).not.toHaveProperty("members");

  const rsvpBootstrap = await publicJson<Record<string, unknown>>(
    `/api/v1/guest/rsvp/bootstrap?token=${encodeURIComponent(guestToken)}`,
  );
  expect(rsvpBootstrap).toHaveProperty("rsvp");
  expect(rsvpBootstrap).not.toHaveProperty("invitation");
  expect(rsvpBootstrap).not.toHaveProperty("operations");

  const bootstrap = await publicJson<{
    household: {
      id: string;
      members: Array<{ householdId?: string; id: string }>;
    };
  }>(`/api/v1/guest/bootstrap?token=${encodeURIComponent(guestToken)}`);
  expect(bootstrap.household.id).toBe(householdId);
  const ownIds = (await guestList()).items
    .filter((guest) => guest.householdId === householdId)
    .map((guest) => guest.id);
  expect(bootstrap.household.members.map((member) => member.id).sort()).toEqual(
    ownIds.sort(),
  );
  expect(
    (
      await playwrightRequest
        .newContext({ baseURL: apiUrl })
        .then(async (api) => {
          const response = await api.get(
            `/api/v1/guest/bootstrap?token=${"x".repeat(40)}`,
          );
          await api.dispose();
          return response;
        })
    ).status(),
  ).toBe(401);
});

test("E2E 17 — Conflict", async () => {
  const first = await apiData<{ version: number }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/households/${householdId}`,
    ),
  );
  const saved = await owner.api.patch(
    `/api/v1/workspaces/${workspaceId}/households/${householdId}`,
    {
      headers: mutationHeaders({ "If-Match": `"${first.version}"` }),
      data: { city: "Orhei" },
    },
  );
  expect(saved.status()).toBe(200);
  const stale = await owner.api.patch(
    `/api/v1/workspaces/${workspaceId}/households/${householdId}`,
    {
      headers: mutationHeaders({ "If-Match": `"${first.version}"` }),
      data: { city: "Cahul" },
    },
  );
  expect(stale.status()).toBe(412);
  const problem = (await stale.json()) as { code: string };
  expect(problem.code).toBe("VERSION_CONFLICT");
});

test("E2E 18 — Overview", async ({ page }) => {
  await authorizePage(page, owner);
  await page.goto("/overview");
  await expect(page.getByText("Invitați și RSVP")).toBeVisible();
  await expect(page.getByText("Invitați activi")).toBeVisible();
  await expect(page.getByText("Alergii de verificat")).toBeVisible();
  const dashboard = await apiData<{
    guestCrm: { activeGuests: number; invited: number; allergyIssues: number };
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/dashboard`));
  expect(dashboard.guestCrm.activeGuests).toBeGreaterThan(2);
  expect(dashboard.guestCrm.invited).toBeGreaterThan(0);
  expect(dashboard.guestCrm.allergyIssues).toBeGreaterThan(0);
});

test("E2E 19 — Demo", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/v1/"))
      apiRequests.push(request.url());
  });
  await page.context().addCookies([
    {
      name: "weddingos_demo",
      value: "1",
      url: origin,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/guests?demo=1");
  await expect(page.getByRole("button", { name: "Import" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Gospodărie" })).toBeDisabled();
  await page.goto("/invitations?demo=1");
  await expect(
    page.getByRole("button", { name: "Pregătește destinatari" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Publică invitația" }),
  ).toBeDisabled();
  await page.goto("/menus?demo=1");
  await expect(page.getByText("Meniurile sunt izolate în demo")).toBeVisible();
  expect(apiRequests).toEqual([]);
});

async function authorizePage(page: Page, account: Account) {
  const state = await account.api.storageState();
  await page.context().addCookies(state.cookies);
}

async function createVerifiedAccount(label: string): Promise<Account> {
  const api = await newApiContext();
  const email = uniqueEmail(label);
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
  const verification = await waitForEmail(
    "Confirmă adresa de email Sarbato",
    email,
  );
  expect(
    (
      await api.post("/api/v1/auth/email-verifications", {
        headers: mutationHeaders(),
        data: { token: verification.token },
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
        location: {
          confirmed: true,
          city: "Chișinău",
          venue: "Sala de evenimente",
        },
        guests: {
          confirmed: true,
          guestCount: 100,
          transport: true,
          accommodation: true,
        },
        budget: { confirmed: true, amount: 150000 },
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
  await ownerDatabase.workspaceSubscription.update({
    where: { workspaceId: workspace.id },
    data: {
      planKey: "PLUS",
      status: "ACTIVE",
      provider: "e2e-test",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    },
  });
  return workspace.id;
}

async function createHousehold(name: string) {
  return apiData<{ id: string; version: number }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/households`, {
      headers: mutationHeaders({
        "Idempotency-Key": `household-${crypto.randomUUID()}`,
      }),
      data: { name, preferredLanguage: "ro", side: "COMMON" },
    }),
  );
}

async function createGuest(
  overrides: Partial<{
    householdId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    isChild: boolean;
    dateOfBirth: string;
  }>,
) {
  return apiData<Guest>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/guests`, {
      headers: mutationHeaders({
        "Idempotency-Key": `guest-${crypto.randomUUID()}`,
      }),
      data: {
        householdId: overrides.householdId ?? householdId,
        firstName: overrides.firstName ?? "Invitat",
        lastName: overrides.lastName ?? "Test",
        email: overrides.email ?? null,
        phone: null,
        preferredLanguage: "ro",
        side: "COMMON",
        isChild: overrides.isChild ?? false,
        dateOfBirth: overrides.dateOfBirth,
        isPlusOne: false,
        plusOneAllowed: false,
        needsTransport: false,
        needsAccommodation: false,
      },
    }),
  );
}

async function guestList(search?: string) {
  return apiData<{
    items: Array<Guest & { isPlusOne: boolean }>;
    summary: { people: { children: number; plusOnes: number } };
  }>(
    await owner.api.get(
      `/api/v1/workspaces/${workspaceId}/guests${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    ),
  );
}

async function invitationSite() {
  return apiData<{
    status: string;
    version: number;
    published: { id: string } | null;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/invitation-site`));
}

async function replaceInvitationStarterContent() {
  const site = await apiData<{
    slug: string;
    defaultLanguage: string;
    availableLanguages: string[];
    accessPolicy: "token_only" | "token_or_access_code";
    version: number;
    draft: {
      document: {
        sections: Array<{
          id: string;
          type: string;
          title?: string;
          visible: boolean;
          content: Record<string, unknown>;
        }>;
      };
      settings: Record<string, unknown>;
    } | null;
  }>(await owner.api.get(`/api/v1/workspaces/${workspaceId}/invitation-site`));
  if (!site.draft) throw new Error("Invitation draft missing in E2E setup");

  const sections = site.draft.document.sections.map((section) => {
    const content = { ...section.content };
    if (section.type === "hero")
      Object.assign(content, {
        names: "Andrei & Andreea",
        date: "8 august 2028",
        venue: "Grădina E2E",
      });
    if (section.type === "countdown")
      Object.assign(content, {
        title: "Mai e puțin până ne vedem",
        date: futureIso(365),
      });
    if (section.type === "schedule")
      content.items = [
        {
          time: "15:00",
          title: "Ceremonia E2E",
          detail: "Grădina E2E",
        },
      ];
    if (section.type === "locations")
      content.items = [
        {
          name: "Grădina E2E",
          address: "Strada Florilor 8",
          url: "",
        },
      ];
    if (section.type === "rsvp")
      Object.assign(content, {
        title: "Vii alături de noi?",
        body: "Confirmă prezența familiei până la termenul de mai jos.",
        deadline: "1 iulie 2028",
      });
    return {
      ...section,
      visible: [
        "story",
        "dress_code",
        "faq",
        "transport",
        "accommodation",
        "contact",
      ].includes(section.type)
        ? false
        : section.visible,
      content,
    };
  });

  await apiData(
    await owner.api.put(
      `/api/v1/workspaces/${workspaceId}/invitation-site/draft`,
      {
        headers: mutationHeaders({ "If-Match": `"${site.version}"` }),
        data: {
          slug: site.slug,
          defaultLanguage: site.defaultLanguage,
          availableLanguages: site.availableLanguages,
          accessPolicy: site.accessPolicy.toUpperCase(),
          document: { sections },
          settings: site.draft.settings,
        },
      },
    ),
  );
}

async function saveRsvpForm(deadline: string) {
  const current = await apiData<{ version: number } | null>(
    await owner.api.get(`/api/v1/workspaces/${workspaceId}/rsvp-form`),
  );
  return apiData<{ version: number }>(
    await owner.api.put(`/api/v1/workspaces/${workspaceId}/rsvp-form`, {
      headers: mutationHeaders(
        current ? { "If-Match": `"${current.version}"` } : {},
      ),
      data: {
        config: {
          deadline,
          attendanceEnabled: true,
          perEventAttendance: true,
          plusOneQuestion: true,
          childrenConfirmation: true,
          menuSelection: true,
          allergyCollection: true,
          accessibilityCollection: true,
          transportQuestion: true,
          accommodationQuestion: true,
          guestMessage: true,
          allowEdits: true,
          closedMessage: "RSVP închis pentru test.",
          languages: ["ro"],
        },
      },
    }),
  );
}

async function publishRsvpForm(version: number) {
  return apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/rsvp-form/publish`,
      {
        headers: mutationHeaders({
          "If-Match": `"${version}"`,
          "Idempotency-Key": `publish-rsvp-${crypto.randomUUID()}`,
        }),
      },
    ),
  );
}

async function createCampaign(
  subject: string,
  purpose: "INVITATION" | "RSVP_REMINDER",
) {
  return apiData<{ id: string; version: number }>(
    await owner.api.post(`/api/v1/workspaces/${workspaceId}/campaigns`, {
      headers: mutationHeaders({
        "Idempotency-Key": `campaign-${crypto.randomUUID()}`,
      }),
      data: {
        name: subject,
        purpose,
        channel: "EMAIL",
        invitationVersionId,
        template: { subject, body: "Te așteptăm alături de noi." },
        audienceFilter: {},
      },
    }),
  );
}

async function sendCampaign(
  id: string,
  version: number,
  transition: "SEND_NOW" | "RETRY_FAILED" = "SEND_NOW",
) {
  const preview =
    transition === "RETRY_FAILED"
      ? null
      : await apiData<{ audienceRevision: string }>(
          await owner.api.get(
            `/api/v1/workspaces/${workspaceId}/campaigns/${id}/audience-preview`,
          ),
        );
  return apiData(
    await owner.api.post(
      `/api/v1/workspaces/${workspaceId}/campaigns/${id}/transitions`,
      {
        headers: mutationHeaders({
          "If-Match": `"${version}"`,
          "Idempotency-Key": `send-${crypto.randomUUID()}`,
        }),
        data: {
          transition,
          ...(preview ? { audienceRevision: preview.audienceRevision } : {}),
        },
      },
    ),
  );
}

async function waitForCampaign(id: string, status: string) {
  let value!: { id: string; version: number; status: string };
  await expect
    .poll(
      async () => {
        value = await apiData(
          await owner.api.get(
            `/api/v1/workspaces/${workspaceId}/campaigns/${id}`,
          ),
        );
        return value.status;
      },
      { timeout: 60_000 },
    )
    .toBe(status);
  return value;
}

async function waitForImport(id: string, status: string) {
  let value!: { version: number; status: string; committedRows: number };
  await expect
    .poll(
      async () => {
        value = await apiData(
          await owner.api.get(
            `/api/v1/workspaces/${workspaceId}/guest-imports/${id}`,
          ),
        );
        return value.status;
      },
      { timeout: 60_000 },
    )
    .toBe(status);
  return value;
}

async function waitForJob(api: APIRequestContext, jobId: string) {
  await expect
    .poll(
      async () => {
        const job = await apiData<{ status: string }>(
          await api.get(`/api/v1/jobs/${jobId}`),
        );
        return job.status;
      },
      { timeout: 60_000 },
    )
    .toBe("completed");
}

async function waitForCampaignEmail(subject: string, email: string) {
  return waitForEmail(subject, email);
}

async function waitForEmail(subject: string, email: string) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const list = (await fetch(
      "http://127.0.0.1:8025/api/v1/messages?limit=100",
    ).then((response) => response.json())) as {
      messages: Array<{
        ID: string;
        MessageID: string;
        Subject: string;
        To: Array<{ Address: string }>;
      }>;
    };
    const summary = list.messages.find(
      (message) =>
        message.Subject === subject &&
        message.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const message = (await fetch(
        `http://127.0.0.1:8025/api/v1/message/${summary.ID}`,
      ).then((response) => response.json())) as { Text: string; HTML?: string };
      const match = message.Text.match(/[?&]token=([^&\s]+)/);
      return {
        token: match?.[1] ? decodeURIComponent(match[1]) : "",
        messageId: summary.MessageID,
        html: message.HTML ?? "",
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`E-mail not delivered: ${subject} -> ${email}`);
}

async function publicJson<T>(path: string): Promise<T> {
  const api = await playwrightRequest.newContext({ baseURL: apiUrl });
  const response = await api.get(path);
  expect(response.status()).toBe(200);
  const body = (await response.json()) as T;
  await api.dispose();
  return body;
}

async function newApiContext() {
  const context = await playwrightRequest.newContext({
    baseURL: apiUrl,
    extraHTTPHeaders: { Origin: origin },
  });
  retainedContexts.push(context);
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

function futureIso(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function uniqueEmail(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
}
