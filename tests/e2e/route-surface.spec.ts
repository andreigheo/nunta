import { execFileSync } from "node:child_process";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { source as axeSource } from "axe-core";

const apiUrl = "http://127.0.0.1:4117";
const origin = "http://127.0.0.1:3117";
const password = "WeddingOS2026!";

const organizerRoutes = [
  "/overview",
  "/plan",
  "/budget",
  "/calendar",
  "/timeline",
  "/guests",
  "/invitations",
  "/invitations/editor",
  "/rsvp",
  "/seating",
  "/menus",
  "/transport",
  "/accommodation",
  "/marketplace",
  "/favorites",
  "/shortlists",
  "/requests",
  "/offers",
  "/bookings",
  "/payments",
  "/contracts",
  "/documents",
  "/design-studio",
  "/moodboards",
  "/risks",
  "/contingency-plans",
  "/automations",
  "/wedding-day",
  "/moments",
  "/post-wedding",
  "/reviews",
  "/archive",
  "/team",
  "/activity",
  "/tools",
  "/settings",
  "/onboarding",
] as const;

const vendorRoutes = [
  "/vendor",
  "/vendor/profile",
  "/vendor/services",
  "/vendor/requests",
  "/vendor/offers",
  "/vendor/bookings",
  "/vendor/contracts",
  "/vendor/reviews",
  "/vendor/billing",
  "/vendor/payouts",
] as const;

const adminRoutes = [
  "/admin",
  "/admin/trust",
  "/admin/users",
  "/admin/workspaces",
  "/admin/vendors",
  "/admin/support",
  "/admin/incidents",
  "/admin/security",
  "/admin/providers",
  "/admin/feature-flags",
  "/admin/privacy",
  "/admin/backups",
  "/admin/restores",
  "/admin/releases",
] as const;

const publicRoutes = [
  "/",
  "/sign-in",
  "/create-account",
  "/forgot-password",
  "/magic-link",
  "/verify-email",
  "/reset-password",
  "/invitation",
  "/vendor-invitation",
  "/expired-link",
  "/session-expired",
  "/access-denied",
  "/checkout",
  "/confidentialitate",
  "/cookies",
  "/privacy",
  "/rambursari",
  "/termeni",
  "/terms",
  "/start",
  "/guest",
] as const;

const productionDisabledRoutes = [
  "/beta",
  "/beta/known-issues",
  "/beta-invitation",
  "/admin/beta",
] as const;

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

test("Release route inventory — every organizer page renders without runtime, overflow or critical accessibility failures", async ({
  browser,
}) => {
  test.setTimeout(12 * 60_000);
  const context = await signedInContext(browser, "owner@weddingos.local");
  await auditRoutes(context, organizerRoutes);
  await context.close();
});

test("Release route inventory — every provider page renders for a real provider owner", async ({
  browser,
}) => {
  test.setTimeout(6 * 60_000);
  const context = await signedInContext(
    browser,
    "vendor-owner@weddingos.local",
  );
  await auditRoutes(context, vendorRoutes);
  await context.close();
});

test("Release route inventory — every platform administration page renders for the administrator", async ({
  browser,
}) => {
  test.setTimeout(8 * 60_000);
  const context = await signedInContext(browser, "admin@weddingos.local");
  await auditRoutes(context, adminRoutes);
  await context.close();
});

test("Release route inventory — every public, legal, auth and guest entry route fails safely", async ({
  browser,
}) => {
  test.setTimeout(8 * 60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await auditRoutes(context, publicRoutes);
  await context.close();
});

test("Release route inventory — controlled beta routes stay unavailable in production", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  for (const route of productionDisabledRoutes) {
    const page = await context.newPage();
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, route).not.toBeNull();
    expect(response!.status(), route).toBe(404);
    await expect(
      page.getByRole("heading", { name: "404" }),
      route,
    ).toBeVisible();
    await page.close();
  }
  await context.close();
});

test("Release route inventory — missing dynamic organizer resources fail with a recoverable state", async ({
  browser,
}) => {
  const context = await signedInContext(browser, "owner@weddingos.local");
  const missingId = "00000000-0000-4000-8000-000000000001";
  const riskPage = await context.newPage();
  await riskPage.goto(`/risks/${missingId}`);
  await expect(
    riskPage.getByText("Riscul nu este disponibil", { exact: true }),
  ).toBeVisible();
  await riskPage.close();

  const contingencyPage = await context.newPage();
  await contingencyPage.goto(`/contingency-plans/${missingId}`);
  await expect(
    contingencyPage.getByText("Planul B nu este disponibil", { exact: true }),
  ).toBeVisible();
  await expect(
    contingencyPage.getByRole("button", { name: "Reîncearcă" }),
  ).toBeVisible();
  await contingencyPage.close();
  await context.close();
});

async function signedInContext(browser: Browser, email: string) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
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

async function auditRoutes(context: BrowserContext, routes: readonly string[]) {
  for (const route of routes) {
    const page = await context.newPage();
    try {
      await auditRoute(page, route);
    } finally {
      await page.close();
    }
  }
}

async function auditRoute(page: Page, route: string) {
  const runtimeErrors: string[] = [];
  const failedResponses: string[] = [];
  const onPageError = (error: Error) => runtimeErrors.push(error.message);
  const onResponse = (response: { status(): number; url(): string }) => {
    if (response.status() >= 500)
      failedResponses.push(`${response.status()} ${response.url()}`);
  };
  page.on("pageerror", onPageError);
  page.on("response", onResponse);
  try {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, route).not.toBeNull();
    expect(response!.status(), route).toBeLessThan(500);
    await expect(page.locator("body"), route).toBeVisible();
    await expect(page.locator("body"), route).not.toContainText(
      /Application error|Internal Server Error|This page could not be found/i,
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        { message: `Horizontal overflow on ${route}` },
      )
      .toBe(true);
    await page.addScriptTag({ content: axeSource });
    const seriousViolations = await page.evaluate(async () => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              root: Document,
              options: Record<string, unknown>,
            ) => Promise<{
              violations: Array<{ id: string; impact: string | null }>;
            }>;
          };
        }
      ).axe;
      const result = await axe.run(document, {
        resultTypes: ["violations"],
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return result.violations.filter((item) =>
        ["serious", "critical"].includes(item.impact ?? ""),
      );
    });
    expect(seriousViolations, route).toEqual([]);
    expect(runtimeErrors, route).toEqual([]);
    expect(failedResponses, route).toEqual([]);
  } finally {
    page.off("pageerror", onPageError);
    page.off("response", onResponse);
  }
}
