import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { source as axeSource } from "axe-core";

const sectionIds = [
  "produs",
  "capabilitati",
  "solutii",
  "planificare",
  "invitatii",
  "furnizori",
  "ziua-evenimentului",
  "abonamente",
  "intrebari",
  "despre",
] as const;

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function dismissCookieBanner(page: Page) {
  const button = page.getByRole("button", { name: "Doar esențiale" });
  if (await button.isVisible().catch(() => false)) await button.click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBe(widths.clientWidth);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await testInfo.attach(name, { path, contentType: "image/png" });
}

async function expectNoAxeViolations(page: Page) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            root: Document,
            options: { runOnly: { type: "tag"; values: string[] } },
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
    const result = await axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.flatMap((node) => node.target),
    }));
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}

async function expectSoundHeadingStructure(page: Page) {
  const levels = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1))),
    );
  expect(levels.filter((level) => level === 1)).toHaveLength(1);
  for (let index = 1; index < levels.length; index += 1) {
    expect(levels[index] <= levels[index - 1] + 1).toBe(true);
  }
}

test("landing desktop — Product-first control room V1", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");
  await expect(page).toHaveTitle(
    "Sarbato: tot evenimentul, într-un singur fir",
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Tot evenimentul, într-un singur fir.",
    }),
  ).toBeVisible();
  await expect(
    page.locator('[data-concept="product-first-control-room-v1"]'),
  ).toBeVisible();
  await expect(page.locator(".marketing-light")).toHaveCSS(
    "color-scheme",
    "light",
  );

  for (const id of sectionIds) {
    await expect(
      page.locator(`#${id}`),
      `Secțiunea #${id} trebuie să existe`,
    ).toHaveCount(1);
  }

  const mainText = await page.locator("main#continut").evaluate((main) => {
    const clone = main.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll("[data-demo-content]")
      .forEach((node) => node.remove());
    return clone.innerText;
  });
  expect(mainText).not.toMatch(/WeddingOS|\bbeta\b|acces timpuriu/i);
  expect(mainText).not.toMatch(
    /\b(?:Ana|Mihai|Maria|Andrei|Elena|Ionescu|Popescu)\b/i,
  );
  await expect(page.getByTestId("showcase-label")).toHaveText(
    "Previzualizare produs",
  );

  await expect(
    page.getByRole("link", { name: "Începe organizarea" }).first(),
  ).toHaveAttribute("href", "/create-account");
  await expect(
    page.getByRole("link", { name: "Vezi produsul" }).first(),
  ).toHaveAttribute("href", "/produs");
  await expect(
    page.getByRole("link", { name: "Autentificare" }).first(),
  ).toHaveAttribute("href", "/sign-in");

  const unresolved = await page
    .getByRole("banner")
    .locator('a[href^="#"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
        .filter((href) => document.querySelector(href) === null),
    );
  expect(unresolved).toEqual([]);

  await expect(page.locator("#planificare")).toContainText(
    "Planul activităților",
  );
  await expect(page.locator("#invitatii")).toContainText("Status RSVP");
  await expect(page.locator("#furnizori")).toContainText(
    "Furnizori, buget și logistică. Totul conectat.",
  );
  await expect(page.locator("#ziua-evenimentului")).toContainText(
    "Comanda evenimentului",
  );
  await expect(page.getByRole("contentinfo")).toHaveCount(1);

  await dismissCookieBanner(page);
  await expectNoHorizontalOverflow(page);
  await expectSoundHeadingStructure(page);
  await expectNoAxeViolations(page);
  await capture(page, testInfo, "landing-control-room-desktop");
  expect(browserErrors).toEqual([]);
});

test("landing mobil — meniu, ordine și adaptare", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Tot evenimentul, într-un singur fir.",
  );

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Sari la conținut" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#continut")).toBeFocused();

  await dismissCookieBanner(page);
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Navigație mobilă" });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole("link", { name: "Produs" }).click();
  await expect(mobileNav).toBeHidden();
  await expect(page).toHaveURL(/\/produs$/);
  await page.goto("/");

  for (const id of sectionIds)
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
  await expectSoundHeadingStructure(page);
  await expectNoAxeViolations(page);

  const stageFlow = page.locator('[aria-label="Firul etapelor evenimentului"]');
  await expect(stageFlow.locator("[data-stage-index]")).toHaveCount(7);
  const stageBounds = await stageFlow
    .locator("[data-stage-index]")
    .evaluateAll((stages) =>
      stages.map((stage) => {
        const rect = stage.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
    );
  expect(
    stageBounds.every(({ left, right }) => left >= 0 && right <= 390),
  ).toBe(true);

  for (const sectionId of ["planificare", "invitatii"] as const) {
    const region = page.locator(`#${sectionId}`).getByRole("region");
    const widths = await region.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(widths.scroll).toBe(widths.client);
  }

  await expect(
    page.locator('#furnizori [class*="vendorCards"] [role="listitem"]'),
  ).toHaveCount(3);
  await capture(page, testInfo, "landing-control-room-mobile");
  expect(browserErrors).toEqual([]);
});

test("footer — grupează toate destinațiile reale ale landingului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1214, height: 900 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const footer = page.getByRole("contentinfo");
  await expect(footer).toBeVisible();
  await expect(
    footer.getByRole("heading", {
      level: 2,
      name: "Tot evenimentul rămâne legat, până la ultimul detaliu.",
    }),
  ).toBeVisible();

  const hrefs = await footer
    .locator("a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

  expect(hrefs).toEqual(
    expect.arrayContaining([
      "/",
      "/produs",
      "/#solutii",
      "/#planificare",
      "/#invitatii",
      "/#furnizori",
      "/#ziua-evenimentului",
      "/#abonamente",
      "/#intrebari",
      "/#despre",
      "/plan",
      "/invitations",
      "/budget",
      "/marketplace",
      "/create-account",
      "/sign-in",
      "/confidentialitate",
      "/termeni",
      "/rambursari",
      "/cookies",
      "#continut",
    ]),
  );
  expect(hrefs).not.toContain("#flux");
  expect(hrefs).not.toContain("#abonamente");

  await footer.getByRole("link", { name: "Produs", exact: true }).click();
  await expect(page).toHaveURL(/\/produs$/);
  await expectNoHorizontalOverflow(page);
});

test("întrebări și răspunsuri — clarifică produsul și funcționează din tastatură", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1214, height: 900 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.getByTestId("faq-section");
  const items = section.locator("details");

  await expect(section).toBeVisible();
  await expect(
    section.getByRole("heading", {
      level: 2,
      name: "Întrebări firești. Răspunsuri clare.",
    }),
  ).toBeVisible();
  await expect(items).toHaveCount(7);
  await expect(items.first()).toHaveAttribute("open", "");
  await expect(items.nth(1)).not.toHaveAttribute("open", "");

  const secondQuestion = items.nth(1).locator("summary");
  await expect(secondQuestion).toContainText("Trebuie să instalez ceva?");
  await secondQuestion.focus();
  await expect(secondQuestion).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(items.nth(1)).toHaveAttribute("open", "");
  await expect(items.nth(1)).toContainText(
    "Sarbato funcționează direct în browser",
  );

  await expectNoHorizontalOverflow(page);
});

test("abonamente — păstrează prețurile și limitele comerciale actuale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1214, height: 900 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.getByTestId("pricing-section");
  const plans = section.locator("article");

  await expect(section).toBeVisible();
  await expect(
    section.getByRole("heading", {
      level: 2,
      name: "Începi gratuit. Alegi mai mult când ai nevoie.",
    }),
  ).toBeVisible();
  await expect(plans).toHaveCount(3);
  await expect(plans.nth(0)).toContainText("Gratuit");
  await expect(plans.nth(0)).toContainText("0 €");
  await expect(plans.nth(0)).toContainText(
    "Până la 50 de invitați și 2 colaboratori",
  );
  await expect(plans.nth(1)).toContainText("Plus");
  await expect(plans.nth(1)).toContainText("7 €");
  await expect(plans.nth(1)).toContainText(
    "Până la 200 de invitați și 5 colaboratori",
  );
  await expect(plans.nth(1)).toHaveAttribute("data-featured", "true");
  await expect(plans.nth(2)).toContainText("Pro");
  await expect(plans.nth(2)).toContainText("17 €");
  await expect(plans.nth(2)).toContainText(
    "Până la 500 de invitați și 15 colaboratori",
  );
  await expect(section.getByRole("link", { name: /Începe/ })).toHaveCount(3);
  for (const link of await section
    .getByRole("link", { name: /Începe/ })
    .all()) {
    await expect(link).toHaveAttribute("href", "/create-account");
  }
  await expect(section).toContainText("Paddle procesează abonamentul Sarbato");
  await expect(section).toContainText(
    "Creezi evenimentul, apoi alegi sau schimbi planul din setările contului.",
  );
  await expectNoHorizontalOverflow(page);

  for (const width of [940, 941, 1024, 1214]) {
    await page.setViewportSize({ width, height: 900 });
    const navBox = await page
      .getByRole("navigation", { name: "Navigație principală" })
      .boundingBox();
    const authBox = await page
      .getByRole("banner")
      .getByRole("link", { name: "Autentificare" })
      .boundingBox();
    expect(navBox).not.toBeNull();
    expect(authBox).not.toBeNull();
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(authBox!.x);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const rows = await plans.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().y)),
  );
  expect(rows[1]).toBeGreaterThan(rows[0]);
  expect(rows[2]).toBeGreaterThan(rows[1]);
  for (const plan of await plans.all()) {
    await expect(plan).toBeVisible();
    await expect(plan.getByRole("link", { name: /Începe/ })).toBeVisible();
  }
  await expect(section).toContainText("Paddle procesează abonamentul Sarbato");
  await expect(
    section.getByRole("link", { name: "Vezi întrebările frecvente" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("landing reference 864 — geometria hero rămâne fidelă conceptului", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 864, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
  const controlRoom = await page.locator("#produs").boundingBox();
  const primary = await page
    .getByRole("link", { name: "Începe organizarea" })
    .nth(1)
    .boundingBox();
  const secondary = await page
    .getByRole("link", { name: "Vezi produsul" })
    .first()
    .boundingBox();

  expect(heading).not.toBeNull();
  expect(controlRoom).not.toBeNull();
  expect(primary).not.toBeNull();
  expect(secondary).not.toBeNull();

  expect(heading!.x).toBeGreaterThanOrEqual(23);
  expect(heading!.x).toBeLessThanOrEqual(25);
  expect(heading!.y).toBeGreaterThanOrEqual(176);
  expect(heading!.y).toBeLessThanOrEqual(179);
  expect(heading!.height).toBeGreaterThanOrEqual(82);
  expect(heading!.height).toBeLessThanOrEqual(86);

  expect(controlRoom!.x).toBeGreaterThanOrEqual(334);
  expect(controlRoom!.x).toBeLessThanOrEqual(337);
  expect(controlRoom!.y).toBeGreaterThanOrEqual(77);
  expect(controlRoom!.y).toBeLessThanOrEqual(79);
  expect(controlRoom!.width).toBeGreaterThanOrEqual(511);
  expect(controlRoom!.width).toBeLessThanOrEqual(514);
  expect(controlRoom!.height).toBeGreaterThanOrEqual(393);
  expect(controlRoom!.height).toBeLessThanOrEqual(402);

  expect(Math.abs(primary!.y - secondary!.y)).toBeLessThan(1);
  await expectNoHorizontalOverflow(page);
  await capture(page, testInfo, "landing-control-room-reference-864");
});

test("Semnătura Sarbato — reproduce cele trei promisiuni aprobate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 900 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const strip = page.getByTestId("assurance-strip");
  const items = page.getByTestId("assurance-item");

  await expect(strip).toBeVisible();
  await expect(
    strip.getByRole("heading", { name: "Începe în ritmul tău." }),
  ).toBeVisible();
  await expect(items).toHaveCount(3);
  await expect(items).toHaveText([
    "Îl încerci fără presiune.Plan gratuit, fără card.",
    "Știi de la început.Costul este clar înainte de plată.",
    "Rămâi pentru că îți place.Poți anula oricând.",
  ]);
  await expect(strip.getByRole("link")).toHaveCount(0);
  await expect(page.getByTestId("service-marquee")).toBeVisible();

  const marqueeFollowsStrip = await strip.evaluate(
    (element) =>
      element.nextElementSibling?.getAttribute("data-testid") ===
      "service-marquee",
  );
  expect(marqueeFollowsStrip).toBe(true);

  const rows = await items.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().y)),
  );
  expect(new Set(rows).size).toBe(1);
  await expectNoHorizontalOverflow(page);
});

test("Hero-ul trece din dashboard în invitația Sarbato fără salt de layout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const showcase = page.getByTestId("product-showcase");
  await expect(showcase).toHaveAttribute("data-showcase-view", "dashboard");
  const before = await showcase.boundingBox();

  await expect(showcase).toHaveAttribute("data-showcase-view", "invitation", {
    timeout: 5_000,
  });
  await expect(
    showcase.getByRole("heading", { name: "THE ASSEMBLY / 2026" }),
  ).toBeVisible();
  await expect(showcase.locator("[data-hero-thread-charge]")).toBeHidden();
  const completeInvitation = showcase.getByTestId("hero-complete-invitation");
  await expect(completeInvitation).toContainText("Programul serii");
  await expect(completeInvitation).toContainText("Locul tău este rezervat");

  const invitationDocument = completeInvitation.locator(
    "[data-invitation-renderer]",
  );
  const invitationScroll = await invitationDocument.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(invitationScroll.scrollHeight).toBeGreaterThan(
    invitationScroll.clientHeight,
  );

  await invitationDocument.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    completeInvitation.getByRole("heading", {
      name: "Locul tău este rezervat",
    }),
  ).toBeVisible();
  const after = await showcase.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(after!.width).toBeCloseTo(before!.width, 1);
  expect(after!.height).toBeCloseTo(before!.height, 1);
  await expectNoHorizontalOverflow(page);
});

test("Dashboardul se transformă în telefon, iar invitația lasă controlul userului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const showcase = page.getByTestId("product-showcase");
  await expect(showcase).toHaveAttribute("data-showcase-view", "dashboard");
  const before = await showcase.boundingBox();

  await expect(showcase).toHaveAttribute("data-showcase-view", "morphing", {
    timeout: 5_000,
  });
  const embeddedReveal = showcase.locator('[data-reveal-variant="embedded"]');
  await expect(embeddedReveal).toHaveAttribute("data-reveal-state", "closed");
  const heroThread = page.getByTestId("hero-thread");
  await expect(heroThread).toHaveAttribute("data-charging", "false");
  await expect(showcase).toHaveAttribute("data-showcase-view", "invitation", {
    timeout: 3_000,
  });

  const phone = showcase.getByTestId("hero-invitation-phone");
  await expect(phone).toBeVisible();
  await expect(phone.locator(":scope > span")).toHaveCount(1);
  const phoneScreen = showcase.getByTestId("hero-invitation-screen");
  await expect(phoneScreen).toBeVisible();
  await expect(embeddedReveal).toHaveCSS("overflow", "hidden");
  await expect(embeddedReveal).toHaveAttribute("data-reveal-state", "opening", {
    timeout: 2_000,
  });
  const envelopeFlap = embeddedReveal.locator("[data-reveal-envelope-flap]");
  await expect(envelopeFlap).toHaveCSS("animation-duration", "1.5s");
  await expect(envelopeFlap).toHaveCSS("animation-delay", "0.35s");
  await expect(
    embeddedReveal.locator("[data-reveal-envelope-flap-back]"),
  ).toHaveCSS("animation-duration", "0.75s");
  await page.waitForTimeout(900);
  await expect(embeddedReveal).toHaveAttribute("data-reveal-state", "opening");
  const invitationLayer = showcase.locator("[data-reveal-invitation]");
  await expect(invitationLayer).toHaveCSS("transform", "none");
  const screenCenter = await phoneScreen.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.x + bounds.width / 2;
  });
  const invitationCenter = await invitationLayer.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.x + bounds.width / 2;
  });
  expect(invitationCenter).toBeCloseTo(screenCenter, 1);
  await expect(showcase.locator("[data-hero-thread-charge]")).toBeVisible();
  await expect(heroThread).toHaveAttribute("data-charging", "true");
  const chargePath = heroThread.locator("svg").nth(1).locator("path");
  const initialChargePath = await chargePath.getAttribute("d");
  const settledPhoneBox = await phone.boundingBox();
  await page.waitForTimeout(850);
  const phoneBox = await phone.boundingBox();
  const after = await showcase.boundingBox();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(settledPhoneBox).not.toBeNull();
  expect(phoneBox).not.toBeNull();
  expect(phoneBox!.width).toBeCloseTo(settledPhoneBox!.width, 1);
  expect(phoneBox!.height).toBeCloseTo(settledPhoneBox!.height, 1);
  expect(await chargePath.getAttribute("d")).toBe(initialChargePath);
  expect(after!.width).toBeCloseTo(before!.width, 1);
  expect(after!.height).toBeCloseTo(before!.height, 1);
  expect(phoneBox!.width).toBeLessThan(after!.width * 0.55);
  expect(phoneBox!.height).toBeGreaterThan(after!.height * 0.85);
  expect(phoneBox!.x + phoneBox!.width / 2).toBeCloseTo(
    after!.x + after!.width / 2,
    1,
  );

  await page.waitForTimeout(750);
  await expect
    .poll(() =>
      chargePath.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).strokeDashoffset),
      ),
    )
    .toBeCloseTo(0, 1);

  const chargeEndBox = await heroThread.locator("circle").boundingBox();
  const chargePortBox = await showcase
    .locator("[data-hero-thread-charge]")
    .boundingBox();
  expect(chargeEndBox).not.toBeNull();
  expect(chargePortBox).not.toBeNull();
  expect(chargeEndBox!.x + chargeEndBox!.width / 2).toBeCloseTo(
    chargePortBox!.x + chargePortBox!.width / 2,
    1,
  );
  expect(chargeEndBox!.y + chargeEndBox!.height / 2).toBeCloseTo(
    chargePortBox!.y + chargePortBox!.height / 2,
    1,
  );

  const completeInvitation = showcase.getByTestId("hero-complete-invitation");
  await expect(completeInvitation).toHaveAttribute(
    "data-auto-scroll",
    "running",
    {
      timeout: 7_000,
    },
  );
  const invitationDocument = showcase.locator("[data-invitation-renderer]");
  const scrollBefore = await invitationDocument.evaluate(
    (element) => element.scrollTop,
  );
  await page.waitForTimeout(400);
  const scrollAfter = await invitationDocument.evaluate(
    (element) => element.scrollTop,
  );
  expect(scrollAfter).toBeGreaterThan(scrollBefore);

  await invitationDocument.dispatchEvent("pointerdown");
  await expect(completeInvitation).toHaveAttribute(
    "data-auto-scroll",
    "stopped",
  );
  await expect(showcase).toHaveAttribute("data-auto-cycle", "paused");

  await invitationDocument.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    showcase.getByRole("heading", {
      name: "Locul tău este rezervat",
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Hero-ul reia la infinit dashboardul după prezentarea completă a invitației", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const showcase = page.getByTestId("product-showcase");
  const heroThread = page.getByTestId("hero-thread");

  await expect(showcase).toHaveAttribute("data-auto-cycle", "running");
  await expect(showcase).toHaveAttribute("data-showcase-view", "dashboard");
  await expect(showcase).toHaveAttribute("data-showcase-view", "invitation", {
    timeout: 6_000,
  });

  const completeInvitation = showcase.getByTestId("hero-complete-invitation");
  await expect(completeInvitation).toHaveAttribute(
    "data-auto-scroll",
    "complete",
    { timeout: 20_000 },
  );
  const fadeObservation = await heroThread.evaluate(
    (element) =>
      new Promise<{
        startDashOffset: number;
        endDashOffset: number;
        startOpacity: number;
        endOpacity: number;
      }>((resolve) => {
        const path = element.querySelectorAll("svg")[1]?.querySelector("path");
        const charge = element.querySelectorAll("svg")[1];
        if (!path || !charge)
          throw new Error("Firul din hero nu este disponibil.");

        const observeFade = () => {
          if (element.dataset.charging !== "fading") return;
          observer.disconnect();
          const startDashOffset = Number.parseFloat(
            getComputedStyle(path).strokeDashoffset,
          );
          const startOpacity = Number.parseFloat(
            getComputedStyle(charge).opacity,
          );
          window.setTimeout(() => {
            resolve({
              startDashOffset,
              endDashOffset: Number.parseFloat(
                getComputedStyle(path).strokeDashoffset,
              ),
              startOpacity,
              endOpacity: Number.parseFloat(getComputedStyle(charge).opacity),
            });
          }, 120);
        };

        const observer = new MutationObserver(observeFade);
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-charging"],
        });
        observeFade();
      }),
  );
  expect(fadeObservation.endDashOffset).toBeCloseTo(
    fadeObservation.startDashOffset,
    3,
  );
  expect(fadeObservation.endOpacity).toBeLessThan(fadeObservation.startOpacity);
  await expect(showcase).toHaveAttribute("data-showcase-view", "returning", {
    timeout: 4_000,
  });
  const returnMotion = await showcase.evaluate((element) => {
    const [dashboard, invitation] = Array.from(
      element.children,
    ) as HTMLElement[];
    const dashboardStyle = getComputedStyle(dashboard!);
    const phone = invitation!.querySelector<HTMLElement>(
      '[data-testid="hero-invitation-phone"]',
    );
    const phoneStyle = getComputedStyle(phone!);
    return {
      dashboardAnimation: dashboardStyle.animationName,
      dashboardDuration: dashboardStyle.animationDuration,
      phoneAnimation: phoneStyle.animationName,
      phoneDuration: phoneStyle.animationDuration,
    };
  });
  expect(returnMotion.dashboardAnimation).toContain("hero-dashboard-return");
  expect(returnMotion.dashboardDuration).toBe("0.52s");
  expect(returnMotion.phoneAnimation).toContain("hero-phone-return");
  expect(returnMotion.phoneDuration).toBe("0.3s");

  await expect(showcase).toHaveAttribute("data-showcase-view", "dashboard", {
    timeout: 2_000,
  });
  await expect(showcase.getByTestId("hero-invitation-phone")).toHaveCount(0);
  await expect(heroThread).toHaveAttribute("data-charging", "false");

  await expect(showcase).toHaveAttribute("data-showcase-view", "morphing", {
    timeout: 5_000,
  });
  await expect(showcase).toHaveAttribute("data-auto-cycle", "running");
  await expectNoHorizontalOverflow(page);
});

test("intro soluții — deschide clar cele patru zone ale produsului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.goto("/");
  await dismissCookieBanner(page);

  const solutions = page.locator("#solutii");
  const heading = solutions.getByRole("heading", {
    level: 2,
    name: "De la plan la ziua evenimentului, fără rupturi.",
  });

  await expect(heading).toBeVisible();
  await expect(solutions).toContainText(
    "Sarbato aduce planul, invitațiile, furnizorii, bugetul și coordonarea din ziua evenimentului într-un singur sistem.",
  );

  const order = await solutions.evaluate((element) => ({
    introFirst:
      element.querySelector("header")?.nextElementSibling?.id === "planificare",
    marqueeBefore:
      element.previousElementSibling?.getAttribute("data-testid") ===
      "service-marquee",
  }));

  expect(order).toEqual({ introFirst: true, marqueeBefore: true });
  await expectNoHorizontalOverflow(page);
});

test("banda de servicii — rulează continuu și se închide fără gol", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const marquee = page.getByTestId("service-marquee");
  const track = page.getByTestId("service-marquee-track");
  const groups = marquee.locator("[data-marquee-group]");

  await expect(marquee).toBeVisible();
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText("Planificare");
  await expect(groups.nth(0)).toContainText("Coordonare în timp real");
  await expect(groups.nth(1)).toHaveAttribute("aria-hidden", "true");

  const motion = await track.evaluate((element) => {
    const style = getComputedStyle(element);
    const animation = element.getAnimations()[0];
    return {
      duration: style.animationDuration,
      iterationCount: style.animationIterationCount,
      timingFunction: style.animationTimingFunction,
      playState: style.animationPlayState,
      iterations: animation?.effect?.getComputedTiming().iterations,
    };
  });

  expect(motion.duration).toBe("30s");
  expect(motion.iterationCount).toBe("infinite");
  expect(motion.timingFunction).toBe("linear");
  expect(motion.playState).toBe("running");
  expect(motion.iterations).toBe(Infinity);

  const seam = await groups.evaluateAll((elements) => {
    const first = elements[0].getBoundingClientRect();
    const second = elements[1].getBoundingClientRect();
    return {
      widthDelta: Math.abs(first.width - second.width),
      edgeDelta: Math.abs(first.right - second.left),
    };
  });

  expect(seam.widthDelta).toBeLessThan(0.5);
  expect(seam.edgeDelta).toBeLessThan(0.5);
  await expectNoHorizontalOverflow(page);
});

test("planificarea — reproduce geometria și toolbarul conceptului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.locator("#planificare");
  const panel = section.locator('[class*="planningPanel"]');
  const toolbar = panel.locator('[class*="planningToolbar"]');
  const table = panel.locator("table");
  const scrollRegion = panel.getByRole("region", {
    name: "Tabelul activităților",
  });

  await expect(toolbar).toContainText("ListăCalendarKanban");
  await expect(toolbar).toContainText("Toate responsabilitățile");
  await expect(panel.locator('[class*="responsibilityAvatar"]')).toHaveCount(5);

  const panelBox = await panel.boundingBox();
  const toolbarBox = await toolbar.boundingBox();
  const tableBox = await table.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(toolbarBox).not.toBeNull();
  expect(tableBox).not.toBeNull();

  expect(panelBox!.x).toBeGreaterThanOrEqual(271);
  expect(panelBox!.x).toBeLessThanOrEqual(273);
  expect(panelBox!.width).toBeGreaterThanOrEqual(551);
  expect(panelBox!.width).toBeLessThanOrEqual(553);
  expect(panelBox!.height).toBeGreaterThanOrEqual(317);
  expect(panelBox!.height).toBeLessThanOrEqual(321);
  expect(toolbarBox!.height).toBeGreaterThanOrEqual(24);
  expect(toolbarBox!.height).toBeLessThanOrEqual(26);
  expect(tableBox!.y - panelBox!.y).toBeGreaterThanOrEqual(93);
  expect(tableBox!.y - panelBox!.y).toBeLessThanOrEqual(96);

  const widths = await scrollRegion.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(widths.scroll).toBe(widths.client);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileWidths = await scrollRegion.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(mobileWidths.scroll).toBe(mobileWidths.client);
  await expect(panel.locator("tbody td[data-label]")).toHaveCount(20);
  await expectNoHorizontalOverflow(page);
});

test("invitații — reproduce tabelul, acțiunile și proporțiile conceptului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.locator("#invitatii");
  const panel = section.locator('[class*="guestsPanel"]');
  const frame = panel.locator('[class*="guestTableFrame"]');
  const scrollRegion = panel.getByRole("region", {
    name: "Tabelul invitaților",
  });

  await expect(panel.locator("thead th")).toHaveCount(6);
  await expect(panel.locator("thead")).toContainText(
    "NumeEmailSegmentStatus RSVP",
  );
  await expect(panel.locator('[class*="guestIconCell"]')).toHaveCount(10);
  await expect(panel.locator('[class*="guestIconCell"] svg')).toHaveCount(7);
  await expect(panel.locator('[class*="panelActions"] svg')).toHaveCount(2);
  await expect(panel.locator('[class*="panelFooter"]')).toContainText(
    "+ Adaugă invitatExportă lista",
  );
  await expect(panel.locator("tbody tr").first()).toContainText(
    "Maria Popescumaria.popescu@email.roEchipăA răspuns",
  );
  await expect(panel.locator("tbody tr").nth(3)).toContainText(
    "Vlad Marinescuvlad.marinescu@email.roPresăNu a răspuns",
  );
  await expect(panel.locator('[class*="statusdanger"]')).toHaveCount(2);

  const panelBox = await panel.boundingBox();
  const frameBox = await frame.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(271);
  expect(panelBox!.x).toBeLessThanOrEqual(273);
  expect(panelBox!.width).toBeGreaterThanOrEqual(551);
  expect(panelBox!.width).toBeLessThanOrEqual(553);
  expect(panelBox!.height).toBeGreaterThanOrEqual(298);
  expect(panelBox!.height).toBeLessThanOrEqual(302);
  expect(frameBox!.y - panelBox!.y).toBeGreaterThanOrEqual(81);
  expect(frameBox!.y - panelBox!.y).toBeLessThanOrEqual(84);
  expect(frameBox!.height).toBeGreaterThanOrEqual(199);
  expect(frameBox!.height).toBeLessThanOrEqual(203);

  const widths = await scrollRegion.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(widths.scroll).toBe(widths.client);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileWidths = await scrollRegion.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(mobileWidths.scroll).toBe(mobileWidths.client);
  await expect(panel.locator("tbody td[data-label]")).toHaveCount(20);
  await expectNoHorizontalOverflow(page);
});

test("furnizori și buget — reproduce matricea și raportul unificat din concept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.locator("#furnizori");
  const panel = section.locator('[class*="commercePanel"]');
  const vendorMatrix = panel.locator('table[class*="vendorMatrix"]');
  const vendorRegion = panel.getByRole("region", {
    name: "Comparație furnizori",
  });
  const budgetBreakdown = panel.locator('[class*="budgetBreakdown__"]');

  await expect(panel).not.toContainText("Furnizori și buget");
  await expect(vendorMatrix.locator("thead")).toContainText(
    "Bright VisionFoto-VideoSoundProTehnicLightArtLighting",
  );
  await expect(vendorMatrix.locator("tbody tr").first()).toContainText(
    "Preț total (RON)12.800Recomandat14.20011.900",
  );
  await expect(vendorMatrix.locator("tbody tr").nth(1)).toContainText(
    "DisponibilitateDisponibilDisponibilParțial",
  );
  await expect(vendorMatrix.locator("tbody tr").last()).toContainText(
    "Termen de plată30 zile30 zile15 zile",
  );
  await expect(vendorMatrix.locator('[class*="rating"] svg')).toHaveCount(15);
  await expect(
    vendorMatrix.locator('[class*="rating"] svg[data-active="true"]'),
  ).toHaveCount(12);

  await expect(panel).toContainText(
    "BugetVezi raportTotal buget120.000 RONCheltuit81.600 RON (68%)",
  );
  await expect(budgetBreakdown).toContainText(
    "CategorieCheltuitLocație36.000 RON90%Tehnic10.400 RON61%Catering16.800 RON70%Marketing6.900 RON46%Altele3.500 RON35%",
  );

  const panelBox = await panel.boundingBox();
  const matrixBox = await vendorMatrix.boundingBox();
  const budgetBox = await budgetBreakdown.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(matrixBox).not.toBeNull();
  expect(budgetBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(39);
  expect(panelBox!.x).toBeLessThanOrEqual(41);
  expect(panelBox!.width).toBeGreaterThanOrEqual(551);
  expect(panelBox!.width).toBeLessThanOrEqual(553);
  expect(panelBox!.height).toBeGreaterThanOrEqual(229);
  expect(panelBox!.height).toBeLessThanOrEqual(233);
  expect(matrixBox!.width).toBeGreaterThanOrEqual(265);
  expect(matrixBox!.width).toBeLessThanOrEqual(268);
  expect(matrixBox!.height).toBeGreaterThanOrEqual(155);
  expect(matrixBox!.height).toBeLessThanOrEqual(159);
  expect(budgetBox!.width).toBeGreaterThanOrEqual(231);
  expect(budgetBox!.width).toBeLessThanOrEqual(234);
  expect(budgetBox!.height).toBeGreaterThanOrEqual(120);
  expect(budgetBox!.height).toBeLessThanOrEqual(124);

  const widths = await vendorRegion.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(widths.scroll).toBe(widths.client);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(vendorRegion).toBeHidden();
  const vendorCards = panel.locator('[class*="vendorCards"] [role="listitem"]');
  await expect(vendorCards).toHaveCount(3);
  await expect(vendorCards.first()).toContainText(
    "Bright VisionFoto-VideoRecomandatPreț total12.800 RONDisponibilitateDisponibilEvaluare internăTermen de plată30 zile",
  );
  await expectNoHorizontalOverflow(page);
});

test("ultimele două capitole — inversează produsul și narațiunea doar pe ecrane late", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.goto("/");
  await dismissCookieBanner(page);

  for (const id of ["furnizori", "ziua-evenimentului"]) {
    const section = page.locator(`#${id}`);
    await expect(section).toHaveAttribute("data-story-layout", "reverse");

    const desktopOrder = await section.evaluate((element) => {
      const copy = element.querySelector<HTMLElement>("[data-story-copy]")!;
      const surface = element.querySelector<HTMLElement>(
        '[class*="storySurface"]',
      )!;
      const copyRect = copy.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        sourceCopyFirst: element.firstElementChild === copy,
        surfaceBeforeCopy: surfaceRect.right < copyRect.left,
      };
    });

    expect(desktopOrder).toEqual({
      sourceCopyFirst: true,
      surfaceBeforeCopy: true,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });

  for (const id of ["furnizori", "ziua-evenimentului"]) {
    const mobileOrder = await page.locator(`#${id}`).evaluate((element) => {
      const copy = element.querySelector<HTMLElement>("[data-story-copy]")!;
      const surface = element.querySelector<HTMLElement>(
        '[class*="storySurface"]',
      )!;
      const copyRect = copy.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return copyRect.bottom <= surfaceRect.top;
    });
    expect(mobileOrder).toBe(true);
  }

  await expectNoHorizontalOverflow(page);
});

test("comanda evenimentului — reproduce programul, echipa și furnizorii din concept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 864, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await dismissCookieBanner(page);

  const section = page.locator("#ziua-evenimentului");
  const panel = section.locator('[class*="operationsPanel"]');
  const grid = panel.locator('[class*="operationsGrid"]');
  const scheduleRows = panel.locator('[class*="operationRow"]');
  const alert = panel.locator('[class*="alertBar"]');

  await expect(panel.getByText("Vezi tot", { exact: true })).toHaveCount(3);
  await expect(scheduleRows).toHaveCount(6);
  await expect(scheduleRows).toHaveText([
    "08:00Sosire echipă tehnică",
    "09:30Setup și testare",
    "11:00Primirea invitaților",
    "12:00Deschidere eveniment",
    "13:00Sesiune 1",
    "14:30Pauză de prânz",
  ]);
  await expect(panel.locator('[class*="operationRowActive"]')).toContainText(
    "12:00Deschidere eveniment",
  );

  await expect(panel.locator('[class*="operationAvatar"]')).toHaveCount(10);
  await expect(
    panel.locator('section[aria-labelledby="team-preview-title"]'),
  ).toContainText(
    "Ioana PopescuProject ManagerOnlineRadu TomaLogisticăOnlineElena DinuCateringOnlineAndrei M.TehnicPe terenVlad M.HostPe teren",
  );
  await expect(
    panel.locator('section[aria-labelledby="field-vendors-title"]'),
  ).toContainText(
    "Bright VisionFoto-VideoLa fața loculuiSoundProTehnicLa fața loculuiGastroPlusCateringLa fața loculuiCity EventsTransportPe drum",
  );
  await expect(
    panel.locator('[class*="operationPresenceSuccess"]'),
  ).toHaveCount(6);
  await expect(
    panel.locator('[class*="operationPresenceWarning"]'),
  ).toHaveCount(2);
  await expect(panel.locator('[class*="operationPresenceDanger"]')).toHaveCount(
    1,
  );
  await expect(alert).toContainText(
    "Alerte și actualizări11:42Livrarea echipamentelor a fost confirmată.Vezi toate",
  );

  const panelBox = await panel.boundingBox();
  const gridBox = await grid.boundingBox();
  const alertBox = await alert.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(gridBox).not.toBeNull();
  expect(alertBox).not.toBeNull();
  expect(panelBox!.x).toBeGreaterThanOrEqual(39);
  expect(panelBox!.x).toBeLessThanOrEqual(41);
  expect(panelBox!.width).toBeGreaterThanOrEqual(551);
  expect(panelBox!.width).toBeLessThanOrEqual(553);
  expect(panelBox!.height).toBeGreaterThanOrEqual(257);
  expect(panelBox!.height).toBeLessThanOrEqual(261);
  expect(gridBox!.x - panelBox!.x).toBeGreaterThanOrEqual(16);
  expect(gridBox!.x - panelBox!.x).toBeLessThanOrEqual(18);
  expect(gridBox!.width).toBeGreaterThanOrEqual(523);
  expect(gridBox!.width).toBeLessThanOrEqual(525);
  expect(gridBox!.height).toBeGreaterThanOrEqual(159);
  expect(gridBox!.height).toBeLessThanOrEqual(162);
  expect(alertBox!.height).toBeGreaterThanOrEqual(39);
  expect(alertBox!.height).toBeLessThanOrEqual(42);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.locator('[class*="operationAvatar"]').first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("control room — păstrează proporția corpului din concept pe toate lățimile split", async ({
  page,
}) => {
  const referenceRatio = 351 / 512;

  for (const width of [821, 864, 940, 941, 1024, 1180, 1437, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");

    const body = await page
      .locator('#produs [class*="controlBody"]')
      .boundingBox();

    expect(body, `control body @ ${width}px`).not.toBeNull();
    expect(
      Math.abs(body!.height / body!.width - referenceRatio),
      `aspect ratio @ ${width}px`,
    ).toBeLessThan(0.008);
    await expectNoHorizontalOverflow(page);
  }
});

test("bara control room — păstrează densitatea compactă din concept", async ({
  page,
}) => {
  for (const width of [821, 864, 1024, 1437, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");

    const rail = await page
      .getByRole("navigation", { name: "Module produs prezentate" })
      .boundingBox();
    const controlBody = await page
      .locator('#produs [class*="controlBody"]')
      .boundingBox();
    const activeModule = await page
      .getByRole("navigation", { name: "Module produs prezentate" })
      .locator("span")
      .first()
      .boundingBox();

    expect(rail, `rail @ ${width}px`).not.toBeNull();
    expect(controlBody, `control body @ ${width}px`).not.toBeNull();
    expect(activeModule, `active module @ ${width}px`).not.toBeNull();
    expect(rail!.width).toBeGreaterThanOrEqual(28);
    expect(rail!.width).toBeLessThanOrEqual(29);
    expect(rail!.x - controlBody!.x).toBeGreaterThanOrEqual(6);
    expect(rail!.x - controlBody!.x).toBeLessThanOrEqual(7);
    expect(rail!.y - controlBody!.y).toBeGreaterThanOrEqual(8);
    expect(rail!.y - controlBody!.y).toBeLessThanOrEqual(9);
    expect(activeModule!.width).toBeGreaterThanOrEqual(28);
    expect(activeModule!.width).toBeLessThanOrEqual(29);
    await expectNoHorizontalOverflow(page);
  }
});

test("firul evenimentului — păstrează ordinea și culorile conceptului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1329, height: 1000 });
  await page.goto("/");

  const flow = page.locator(
    '#produs [aria-label="Firul etapelor evenimentului"]',
  );
  const stages = flow.locator('[class*="flowStage"]');
  const nodes = stages.locator('[class*="flowNode"]');

  await expect(stages).toHaveText([
    "Plan",
    "Invitații",
    "RSVP",
    "Logistică",
    "Furnizori",
    "Buget",
    "Ziua evenimentului",
  ]);

  const colors = await nodes.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return { border: style.borderColor, icon: style.color };
    }),
  );
  expect(colors).toEqual([
    { border: "rgb(66, 19, 67)", icon: "rgb(66, 19, 67)" },
    { border: "rgb(66, 19, 67)", icon: "rgb(66, 19, 67)" },
    { border: "rgb(66, 19, 67)", icon: "rgb(66, 19, 67)" },
    { border: "rgb(231, 173, 34)", icon: "rgb(231, 173, 34)" },
    { border: "rgb(91, 157, 118)", icon: "rgb(91, 157, 118)" },
    { border: "rgb(91, 157, 118)", icon: "rgb(91, 157, 118)" },
    { border: "rgb(91, 157, 118)", icon: "rgb(91, 157, 118)" },
  ]);

  const lineBackground = await flow
    .locator('[class*="flowLine"]')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(lineBackground).toContain("rgb(66, 19, 67)");
  expect(lineBackground).toContain("rgb(91, 157, 118)");
  expect(lineBackground).not.toContain("rgb(231, 173, 34)");
});

test("liniile capitolelor — formează cele două trasee continue din concept", async ({
  page,
}) => {
  for (const width of [864, 1329]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");

    const layer = page.getByTestId("story-thread-layer");
    await expect(layer, `thread layer @ ${width}px`).toBeVisible();
    await expect(layer.locator("path")).toHaveCount(2);

    const geometry = await page.evaluate(() => {
      const stack = document.querySelector<HTMLElement>("#solutii")!;
      const stackRect = stack.getBoundingClientRect();
      const nodes = Array.from(
        stack.querySelectorAll<HTMLElement>("[data-story-node]"),
      ).map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - stackRect.left,
          y: rect.top + rect.height / 2 - stackRect.top,
        };
      });
      const paths = Array.from(
        stack.querySelectorAll<SVGPathElement>(
          '[data-testid="story-thread-layer"] path',
        ),
      ).map((path) => {
        const d = path.getAttribute("d") ?? "";
        const start = d.match(/^M ([\d.-]+) ([\d.-]+)/);
        const terminal = d.match(/([\d.-]+) ([\d.-]+)$/);
        return {
          start: start ? { x: Number(start[1]), y: Number(start[2]) } : null,
          terminal: terminal
            ? { x: Number(terminal[1]), y: Number(terminal[2]) }
            : null,
          cornerDepth: Number(path.dataset.cornerDepth),
          mirrored: path.dataset.mirrored,
          stroke: getComputedStyle(path).stroke,
          length: path.getTotalLength(),
        };
      });
      const gradients = Array.from(
        stack.querySelectorAll<SVGLinearGradientElement>(
          '[data-testid="story-thread-layer"] linearGradient',
        ),
      ).map((gradient) =>
        Array.from(gradient.querySelectorAll("stop")).map(
          (stop) => getComputedStyle(stop).stopColor,
        ),
      );
      const surfaces = Array.from(
        stack.querySelectorAll<HTMLElement>("[class*='storySurface']"),
      ).map((surface) => {
        const rect = surface.getBoundingClientRect();
        return { x: rect.x, width: rect.width };
      });

      return { nodes, paths, gradients, surfaces };
    });

    expect(geometry.gradients).toEqual([
      [
        "rgb(66, 19, 67)",
        "rgb(66, 19, 67)",
        "rgb(91, 157, 118)",
        "rgb(91, 157, 118)",
      ],
      [
        "rgb(231, 173, 34)",
        "rgb(231, 173, 34)",
        "rgb(91, 157, 118)",
        "rgb(91, 157, 118)",
      ],
    ]);
    expect(geometry.paths.map((path) => path.mirrored)).toEqual([
      "false",
      "true",
    ]);
    geometry.paths.forEach((path, index) => {
      const firstNode = geometry.nodes[index * 2];
      const secondNode = geometry.nodes[index * 2 + 1];
      expect(path.start).not.toBeNull();
      expect(path.terminal).not.toBeNull();
      expect(Math.abs(path.start!.x - firstNode.x)).toBeLessThan(0.6);
      expect(Math.abs(path.start!.y - firstNode.y)).toBeLessThan(0.6);
      expect(Math.abs(path.terminal!.x - secondNode.x)).toBeLessThan(0.6);
      expect(Math.abs(path.terminal!.y - secondNode.y)).toBeLessThan(0.6);
      expect(path.stroke).toContain("url");
      expect(path.cornerDepth).toBeGreaterThanOrEqual(6);
      expect(path.cornerDepth).toBeLessThanOrEqual(8);
      expect(path.length).toBeGreaterThan(800);
    });

    if (width === 864) {
      expect(geometry.surfaces[0].x).toBeGreaterThanOrEqual(271);
      expect(geometry.surfaces[0].x).toBeLessThanOrEqual(273);
    }
    await expectNoHorizontalOverflow(page);
  }
});

test("cardurile de status din hero — urmează ordinea, iconografia și paleta conceptului", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1329, height: 1000 });
  await page.goto("/");

  const cards = page.locator("#produs [data-metric-key]");
  await expect(cards).toHaveCount(4);
  await expect(cards.locator("h3")).toHaveText([
    "RSVP",
    "Buget",
    "Activități",
    "Furnizori",
  ]);
  await expect(cards.locator("p")).toHaveText([
    "Răspunsuri primite",
    "Cheltuit până acum",
    "De făcut astăzi",
    "Confirmări în așteptare",
  ]);
  await expect(cards.locator("a")).toHaveText([
    "Vezi detalii",
    "Vezi bugetul",
    "Vezi lista",
    "Vezi furnizorii",
  ]);
  await expect(cards.locator("strong")).toHaveText([
    "128 / 240",
    "68%",
    "7",
    "3",
  ]);
  await expect(cards.first().locator("xpath=..")).toHaveAttribute(
    "data-metric-source",
    "demo",
  );

  const geometry = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const card = element.getBoundingClientRect();
      const title = element.querySelector("h3")!.getBoundingClientRect();
      const icon = element.querySelector("div > span")!;
      const bar = element.querySelector<HTMLElement>(
        "[class*='metricBar'] > i",
      )!;
      const track = bar.parentElement!;
      return {
        width: card.width,
        height: card.height,
        titleHeight: title.height,
        iconColor: getComputedStyle(icon).color,
        barColor: getComputedStyle(bar).backgroundColor,
        barRatio:
          bar.getBoundingClientRect().width /
          track.getBoundingClientRect().width,
      };
    }),
  );

  expect(
    Math.max(...geometry.map(({ width }) => width)) -
      Math.min(...geometry.map(({ width }) => width)),
  ).toBeLessThan(1);
  expect(
    Math.max(...geometry.map(({ height }) => height)) -
      Math.min(...geometry.map(({ height }) => height)),
  ).toBeLessThan(1);
  expect(
    Math.max(...geometry.map(({ titleHeight }) => titleHeight)) -
      Math.min(...geometry.map(({ titleHeight }) => titleHeight)),
  ).toBeLessThan(1);
  expect(geometry.map(({ iconColor }) => iconColor)).toEqual([
    "rgb(91, 157, 118)",
    "rgb(36, 28, 36)",
    "rgb(239, 107, 88)",
    "rgb(36, 28, 36)",
  ]);
  expect(geometry.map(({ barColor }) => barColor)).toEqual([
    "rgb(91, 157, 118)",
    "rgb(91, 157, 118)",
    "rgb(239, 107, 88)",
    "rgb(91, 157, 118)",
  ]);
  expect(geometry.map(({ barRatio }) => Number(barRatio.toFixed(2)))).toEqual([
    0.62, 0.68, 0.52, 0.52,
  ]);
  await expectNoHorizontalOverflow(page);
});

test("firul hero — rămâne ancorat între CTA și control room la toate lățimile split", async ({
  page,
}) => {
  for (const width of [821, 864, 940, 941, 1024, 1180, 1181, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("hero-thread")).toHaveAttribute(
      "data-ready",
      "true",
    );

    const anchors = await page.evaluate(() => {
      const hero = document.querySelector<HTMLElement>(
        '[data-concept="product-first-control-room-v1"] > section:first-child',
      );
      const primary = hero?.querySelector<HTMLAnchorElement>(
        'a[href="/create-account"]',
      );
      const secondary = primary?.nextElementSibling;
      const thread = hero?.querySelector<HTMLElement>(
        '[data-testid="hero-thread"]',
      );
      const curve = thread?.querySelector<SVGSVGElement>(
        'svg[viewBox="0 0 260 82"]',
      );
      const dot = thread?.querySelector<HTMLElement>("span");
      const copy = hero?.querySelector<HTMLElement>("[data-hero-thread-start]")
        ?.parentElement?.parentElement;
      const control = document.querySelector<HTMLElement>("#produs");

      if (
        !primary ||
        !(secondary instanceof HTMLElement) ||
        !thread ||
        !curve ||
        !dot ||
        !copy ||
        !control
      ) {
        return null;
      }
      const primaryRect = primary.getBoundingClientRect();
      const secondaryRect = secondary.getBoundingClientRect();
      const threadRect = thread.getBoundingClientRect();
      const dotRect = dot.getBoundingClientRect();
      const controlRect = control.getBoundingClientRect();

      return {
        startDelta: threadRect.x - (primaryRect.x + primaryRect.width / 2),
        startYDelta: threadRect.y - primaryRect.bottom,
        endDelta: dotRect.x + dotRect.width / 2 - controlRect.x,
        dotRoundness: Math.abs(dotRect.width - dotRect.height),
        buttonRowDelta: secondaryRect.y - primaryRect.y,
        layers: {
          curve: Number(getComputedStyle(curve).zIndex),
          control: Number(getComputedStyle(control).zIndex),
          copy: Number(getComputedStyle(copy).zIndex),
          dot: Number(getComputedStyle(dot).zIndex),
        },
        dotColors: {
          outer: getComputedStyle(dot).borderColor,
          inner: getComputedStyle(dot, "::before").borderColor,
          center: getComputedStyle(dot, "::before").backgroundColor,
          innerWidth: getComputedStyle(dot, "::before").borderWidth,
        },
      };
    });

    expect(anchors).not.toBeNull();
    expect(Math.abs(anchors!.startDelta), `start @ ${width}px`).toBeLessThan(1);
    expect(Math.abs(anchors!.startYDelta), `start y @ ${width}px`).toBeLessThan(
      1,
    );
    expect(Math.abs(anchors!.endDelta), `end @ ${width}px`).toBeLessThan(1);
    expect(anchors!.dotRoundness, `dot @ ${width}px`).toBeLessThan(0.2);
    expect(
      Math.abs(anchors!.buttonRowDelta),
      `buttons @ ${width}px`,
    ).toBeLessThan(1);
    expect(anchors!.layers, `layers @ ${width}px`).toEqual({
      curve: 0,
      control: 1,
      copy: 2,
      dot: 3,
    });
    expect(anchors!.dotColors, `dot colors @ ${width}px`).toEqual({
      outer: "rgba(239, 107, 88, 0.35)",
      inner: "rgb(239, 107, 88)",
      center: "rgb(255, 254, 253)",
      innerWidth: "2px",
    });
    await expectNoHorizontalOverflow(page);
  }

  await expect(
    page.locator('[data-testid="hero-thread"] svg').first().locator("path"),
  ).toHaveAttribute("d", "M0 0 C0 56 14 70 53 70 C124 70 202 14 260 14");

  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto("/");
  await expect(
    page.locator(
      '[data-concept="product-first-control-room-v1"] > section:first-child [data-testid="hero-thread"]',
    ),
  ).toBeHidden();
});

for (const viewport of [
  { name: "320", width: 320, height: 720 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "laptop-1024", width: 1024, height: 768 },
] as const) {
  test(`landing ${viewport.name} — fără overflow`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test("tranziția mobil-tabletă — nu lasă coloane fantomă sau salturi de lățime", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const samples: Array<{ viewport: number; panelWidth: number }> = [];
  for (const width of [639, 640, 641, 660, 700, 740, 780, 800, 820]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await dismissCookieBanner(page);

    const geometry = await page.locator("#produs").evaluate((controlRoom) => {
      const body = controlRoom.querySelector<HTMLElement>(
        '[class*="controlBody"]',
      );
      const content = controlRoom.querySelector<HTMLElement>(
        '[class*="controlContent"]',
      );
      const nextStep = controlRoom.querySelector<HTMLElement>(
        '[class*="mobileNextStep"]',
      );
      if (!body || !content || !nextStep) return null;

      const panelRect = controlRoom.getBoundingClientRect();
      const bodyRect = body.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const nextRect = nextStep.getBoundingClientRect();
      return {
        panelWidth: panelRect.width,
        bodyWidth: bodyRect.width,
        contentWidth: contentRect.width,
        contentOffset: contentRect.x - bodyRect.x,
        nextWidth: nextRect.width,
      };
    });

    expect(geometry, `geometrie @ ${width}px`).not.toBeNull();
    expect(
      Math.abs(geometry!.contentOffset),
      `aliniere conținut @ ${width}px`,
    ).toBeLessThan(1);
    expect(
      geometry!.contentWidth / geometry!.bodyWidth,
      `corp complet @ ${width}px`,
    ).toBeGreaterThan(0.99);
    expect(
      geometry!.nextWidth / geometry!.contentWidth,
      `card următorul pas @ ${width}px`,
    ).toBeGreaterThan(0.9);

    samples.push({ viewport: width, panelWidth: geometry!.panelWidth });
    await expectNoHorizontalOverflow(page);
  }

  for (let index = 1; index < samples.length; index += 1) {
    expect(
      samples[index].panelWidth,
      `lățimea trebuie să crească fluid @ ${samples[index].viewport}px`,
    ).toBeGreaterThanOrEqual(samples[index - 1].panelWidth - 0.5);
  }

  const before = samples.find(({ viewport }) => viewport === 640)!;
  const after = samples.find(({ viewport }) => viewport === 641)!;
  expect(Math.abs(after.panelWidth - before.panelWidth)).toBeLessThan(2);
});
