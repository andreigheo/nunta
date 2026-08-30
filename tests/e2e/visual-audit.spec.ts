import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { source as axeSource } from "axe-core";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";
const vendorOrganizationId = "55550000-0000-4000-8000-000000000002";
const auditRoot =
  process.env.WEDDINGOS_AUDIT_ROOT ??
  resolve(process.cwd(), "ops/artifacts/audit-20260808");

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(auditRoot, { recursive: true });
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

test("Visual audit — registration intent is clear on desktop and mobile", async ({
  browser,
}) => {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const desktopPage = await desktop.newPage();
  await desktopPage.goto("/create-account");
  await desktopPage
    .getByRole("button", { name: /Organizez un eveniment/ })
    .click();
  await expectNoHorizontalOverflow(desktopPage);
  await expectNoSeriousAxeViolations(desktopPage);
  await desktopPage.screenshot({
    path: resolve(auditRoot, "01-create-account-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto("/create-account");
  await mobilePage
    .getByRole("button", { name: /Ofer servicii pentru evenimente/ })
    .click();
  await expectNoHorizontalOverflow(mobilePage);
  await mobilePage.screenshot({
    path: resolve(auditRoot, "02-create-account-mobile-provider.png"),
    fullPage: true,
    animations: "disabled",
  });
  await mobile.close();
});

test("Visual audit — event roles show readable and bounded team states", async ({
  browser,
}) => {
  const family = await signedInContext(browser, "family@weddingos.local", {
    width: 1440,
    height: 1000,
  });
  const familyPage = await family.newPage();
  await familyPage.goto("/team");
  await expect(
    familyPage.getByText("Echipă", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    familyPage.getByRole("button", { name: "Invită membru" }),
  ).toHaveCount(0);
  await expect(familyPage.getByText("Acces configurat:").first()).toBeVisible();
  await familyPage.screenshot({
    path: resolve(auditRoot, "03-family-team-readonly-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await family.close();

  const viewer = await signedInContext(browser, "viewer@weddingos.local", {
    width: 390,
    height: 844,
  });
  const viewerPage = await viewer.newPage();
  await viewerPage.goto("/team");
  await expect(
    viewerPage.getByText("Acest modul nu face parte din rolul tău"),
  ).toBeVisible();
  await expectNoHorizontalOverflow(viewerPage);
  await viewerPage.screenshot({
    path: resolve(auditRoot, "04-viewer-access-boundary-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await viewer.close();
});

test("Visual audit — provider viewer and operations roles have distinct controls", async ({
  browser,
}) => {
  const viewer = await signedInContext(
    browser,
    "vendor-viewer@weddingos.local",
    { width: 1440, height: 1000 },
  );
  const viewerPage = await viewer.newPage();
  await viewerPage.goto(
    `/vendor/services?organization=${vendorOrganizationId}`,
  );
  await expect(
    viewerPage.getByText("Ai acces de consultare", { exact: false }),
  ).toBeVisible();
  await expectNoSeriousAxeViolations(viewerPage);
  await viewerPage.screenshot({
    path: resolve(auditRoot, "05-vendor-viewer-services-readonly-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await viewer.close();

  const operations = await signedInContext(
    browser,
    "vendor-operations@weddingos.local",
    { width: 390, height: 844 },
  );
  const operationsPage = await operations.newPage();
  await operationsPage.goto(
    `/vendor/services?organization=${vendorOrganizationId}`,
  );
  await expect(
    operationsPage.getByRole("button", { name: "Disponibilitate" }),
  ).toBeVisible();
  await expect(
    operationsPage.getByRole("button", { name: "Serviciu" }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(operationsPage);
  await operationsPage.screenshot({
    path: resolve(auditRoot, "06-vendor-operations-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await operations.close();
});

test("Visual audit — platform administrator lands in the real control center", async ({
  browser,
}) => {
  const admin = await signedInContext(browser, "admin@weddingos.local", {
    width: 1440,
    height: 1000,
  });
  const page = await admin.newPage();
  await page.goto("/admin");
  await expect(page.getByText("Platform Admin").first()).toBeVisible();
  await expect(
    page.getByText("Utilizatori", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(auditRoot, "07-platform-admin-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await admin.close();
});

test("Visual audit — organizer has one clear path from setup to plan and budget", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const desktop = await signedInContext(browser, "owner@weddingos.local", {
    width: 1440,
    height: 1000,
  });
  const workspace = await desktop.request.post(`${apiUrl}/api/v1/workspaces`, {
    headers: {
      Origin: origin,
      "Idempotency-Key": `visual-guided-${randomUUID()}`,
    },
    data: {
      title: "Parcurs ghidat visual audit",
      partnerOneName: "",
      partnerTwoName: "",
    },
  });
  expect(workspace.status()).toBe(201);
  const page = await desktop.newPage();

  await page.goto("/overview");
  await expect(page.getByText("De aici începi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Completează detaliile" }),
  ).toBeVisible();
  await captureGuidedSurface(page, "08-guided-overview-empty-desktop.png");

  await page.getByRole("button", { name: "Completează detaliile" }).click();
  await expect(page.getByRole("heading", { name: "Cuplul" })).toBeVisible();
  await page.getByLabel("Numele partenerului 1").fill("Olivia");
  await page.getByLabel("Numele partenerului 2").fill("Paul");
  await page.getByLabel("Titlul nunții").fill("Olivia & Paul");
  await page.getByLabel("Cum vă numim în interfață?").fill("Olivia și Paul");
  await captureGuidedSurface(page, "09-guided-onboarding-start-desktop.png");
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(
    page.getByRole("heading", { name: "Data & evenimentele" }),
  ).toBeVisible();
  await page.getByLabel("Data evenimentului").fill("2027-09-12");
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(page.getByRole("heading", { name: "Locația" })).toBeVisible();
  await page.getByLabel("Țară").selectOption("Republica Moldova");
  await page.getByLabel("Județ / regiune").fill("Chișinău");
  await page.getByLabel("Oraș").fill("Chișinău");
  await page.getByLabel("Numele locației").fill("Grădina Botanică");
  await page.getByLabel("Adresa").fill("Chișinău, Republica Moldova");
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(page.getByRole("heading", { name: "Invitații" })).toBeVisible();
  await page.getByLabel("Invitați estimați (total)").fill("120");
  await page.getByLabel("Adulți").fill("104");
  await page.getByLabel("Copii").fill("16");
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(page.getByRole("heading", { name: "Bugetul" })).toBeVisible();
  await page.getByLabel("Buget țintă").fill("185000");
  await page.getByLabel("Monedă").selectOption("RON");
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(page.getByRole("heading", { name: "Stilul" })).toBeVisible();
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(
    page.getByRole("heading", { name: "Progres existent" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continuă" }).click();

  await expect(page.getByRole("heading", { name: "Preferințe" })).toBeVisible();
  await captureGuidedSurface(page, "10-guided-onboarding-finish-desktop.png");
  await page
    .getByRole("button", { name: "Salvează și creează planul" })
    .click();

  await expect(page).toHaveURL(/\/plan(?:\?|$)/, { timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Planul evenimentului" }),
  ).toBeVisible();
  await expect(page.getByText("Ce include propunerea")).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByText("Data exactă a nunții nu este confirmată."),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Data este flexibilă; termenele rămân relative/),
  ).toHaveCount(0);
  await page.screenshot({
    path: resolve(auditRoot, "11-guided-plan-proposal-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Aplică planul" }).click();
  await expect(page.getByText("Plan aplicat")).toBeVisible({ timeout: 45_000 });

  await page.goto("/overview");
  await expect(
    page.getByRole("button", { name: "Configurează bugetul" }),
  ).toBeVisible();
  await captureGuidedSurface(page, "12-guided-overview-plan-ready-desktop.png");

  await page.getByRole("button", { name: "Configurează bugetul" }).click();
  await expect(
    page.getByRole("heading", { name: "Bugetul evenimentului" }),
  ).toBeVisible();
  await expect(page.getByText("185.000 RON")).toBeVisible();
  await captureGuidedSurface(page, "13-guided-budget-import-desktop.png");
  await page.getByRole("button", { name: "Folosește această țintă" }).click();
  await expect(
    page.getByRole("dialog", { name: "Ținta bugetului" }),
  ).toBeVisible();
  const budgetTarget = page.getByLabel("Țintă totală (RON)");
  await expect(budgetTarget).toHaveValue("185000");
  await captureGuidedSurface(
    page,
    "13a-guided-budget-dialog-before-desktop.png",
  );
  await budgetTarget.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("185000");
  await expect(budgetTarget).toBeFocused();
  await expect(budgetTarget).toHaveValue("185000");
  await captureGuidedSurface(
    page,
    "13b-guided-budget-dialog-focused-desktop.png",
  );
  await page.getByRole("button", { name: "Salvează", exact: true }).click();
  await expect(page.getByText("Buget actualizat")).toBeVisible();
  await captureGuidedSurface(page, "14-guided-budget-configured-desktop.png");

  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();
  await captureGuidedSurface(page, "15-guided-calendar-desktop.png");
  await desktop.close();

  const mobile = await signedInContext(browser, "owner@weddingos.local", {
    width: 390,
    height: 844,
  });
  const mobilePage = await mobile.newPage();
  for (const [path, heading, filename] of [
    ["/overview", "Olivia & Paul", "16-guided-overview-mobile.png"],
    ["/plan", "Planul evenimentului", "17-guided-plan-mobile.png"],
    ["/budget", "Bugetul evenimentului", "18-guided-budget-mobile.png"],
    ["/calendar", "Calendar", "19-guided-calendar-mobile.png"],
  ] as const) {
    await mobilePage.goto(path);
    await expect(
      mobilePage.getByRole("heading", { name: heading }).first(),
    ).toBeVisible();
    if (path === "/plan") {
      await expect(
        mobilePage.getByRole("button", { name: /^Deschide sarcina/ }).first(),
      ).toBeVisible();
    }
    await captureGuidedSurface(mobilePage, filename);
  }
  await mobile.close();
});

async function signedInContext(
  browser: Browser,
  email: string,
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({ viewport });
  const response = await context.request.post(
    `${apiUrl}/api/v1/auth/sessions`,
    {
      headers: { Origin: origin },
      data: { email, password, remember: true },
    },
  );
  expect(response.status(), email).toBe(200);
  return context;
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBe(widths.clientWidth);
}

async function captureGuidedSurface(page: Page, filename: string) {
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAxeViolations(page);
  await page.screenshot({
    path: resolve(auditRoot, filename),
    fullPage: true,
    animations: "disabled",
  });
}

async function expectNoSeriousAxeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const result = await (
      window as unknown as {
        axe: {
          run(root: Document): Promise<{
            violations: Array<{ id: string; impact: string | null }>;
          }>;
        };
      }
    ).axe.run(document);
    return result.violations.filter((item) =>
      ["critical", "serious"].includes(item.impact ?? ""),
    );
  });
  expect(violations).toEqual([]);
}
