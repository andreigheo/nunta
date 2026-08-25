import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { source as axeSource } from "axe-core";

const sectionIds = [
  "flux",
  "planificare",
  "invitatii",
  "furnizori",
  "ziua-evenimentului",
  "incredere",
  "abonamente",
  "intrebari",
] as const;

function publicSections(page: Page) {
  return page.locator(
    'main#continut > section, main#continut > div[aria-label="Povestea produsului Sarbato"] > section',
  );
}

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
  if (await button.isVisible().catch(() => false)) {
    await button.click();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    )
    .toEqual(
      await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.clientWidth,
      })),
    );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
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
    expect(
      levels[index] <= levels[index - 1] + 1,
      `Heading level jumps from h${levels[index - 1]} to h${levels[index]}`,
    ).toBe(true);
  }
}

test("landing desktop — brand Sarbato, secțiuni, fallback onest și flux accesibil", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");

  await expect(page).toHaveTitle(
    "Sarbato — plan, invitații, furnizori și ziua nunții, împreună",
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
    }),
  ).toBeVisible();
  await expect(page.locator(".marketing-light")).toHaveCSS(
    "color-scheme",
    "light",
  );
  await expect(publicSections(page)).toHaveCount(10);

  for (const id of sectionIds) {
    await expect(
      page.locator(`#${id}`),
      `Secțiunea #${id} trebuie să existe`,
    ).toHaveCount(1);
  }

  // Niciun rest de brand vechi sau limbaj de stadiu pe suprafața publică.
  const bodyText = await page.locator("main#continut").innerText();
  expect(bodyText).not.toMatch(/WeddingOS/i);
  expect(bodyText).not.toMatch(/\bdemo\b/i);
  expect(bodyText).not.toMatch(/\bbeta\b|acces timpuriu/i);
  expect(bodyText).not.toMatch(
    /\b(?:Ana|Mihai|Maria|Andrei|Elena|Ionescu|Popescu)\b/i,
  );

  // Dovada publică este ascunsă complet când agregatul lipsește; vitrina
  // de produs rămâne etichetată, fără cifre inventate.
  await expect(page.getByTestId("public-proof-metrics")).toHaveCount(0);
  await expect(page.getByTestId("product-proof-fallback")).toHaveCount(0);
  const showcaseLabels = page.getByTestId("showcase-label");
  await expect(showcaseLabels.first()).toBeVisible();
  expect(await showcaseLabels.count()).toBeGreaterThanOrEqual(4);
  await expect(
    page
      .getByText("Exemplu de produs — nu reprezintă datele unui client.")
      .first(),
  ).toBeVisible();

  // Suprafețele vitrină nu conțin sume, nume fictive sau cuvântul „live”.
  const showcaseText = await page.getByTestId("product-showcase").innerText();
  expect(showcaseText).not.toMatch(
    /(?:\bRON\b|\bUSD\b|\$|\b\d+[.,]?\d*\s*(?:lei|ron|eur)\b)/i,
  );
  expect(showcaseText).not.toMatch(/\blive\b/i);

  // Hero-ul prezintă acțiunea, responsabilul, termenul și modulele conectate.
  await expect(
    page.getByTestId("product-showcase").getByText("Următoarea acțiune"),
  ).toBeVisible();
  await expect(
    page.getByTestId("product-showcase").getByText(/Responsabil:/),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("product-showcase")
      .getByText(/Termen:|Valabilitate:|Stare:/),
  ).toBeVisible();
  await expect(
    page.getByText("Disponibil acum pentru organizarea nunților").first(),
  ).toBeVisible();

  // Toate ancorele din header și footer rezolvă către secțiuni reale.
  for (const region of [
    page.getByRole("banner"),
    page.getByRole("contentinfo"),
  ]) {
    const unresolved = await region
      .locator('a[href^="#"]')
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href))
          .filter((href) => document.querySelector(href) === null),
      );
    expect(unresolved).toEqual([]);
  }

  await dismissCookieBanner(page);

  // CTA-urile sunt rute reale; nu există CTA de demo.
  await expect(
    page.getByRole("link", { name: "Creează primul eveniment" }).first(),
  ).toHaveAttribute("href", "/create-account");
  await expect(
    page.getByRole("link", { name: "Creează eveniment" }).first(),
  ).toHaveAttribute("href", "/create-account");
  await expect(
    page.getByRole("link", { name: "Intră în cont" }).first(),
  ).toHaveAttribute("href", "/sign-in");
  await expect(
    page.getByRole("link", { name: "Confidențialitate" }),
  ).toHaveAttribute("href", "/confidentialitate");

  // Interacțiunea semnătură: un RSVP schimbă vizibil conținutul conectat.
  const rsvpStep = page.locator("#flux").getByRole("button", { name: /RSVP/ });
  await rsvpStep.click();
  await expect(rsvpStep).toHaveAttribute("aria-pressed", "true");
  const flux = page.locator("#flux");
  await expect(flux.locator('[aria-live="polite"]')).toContainText(
    "Confirmarea nu rămâne într-un mesaj",
  );
  await expect(flux).toContainText("Invitat");
  await expect(flux).toContainText("Stare actualizată");
  await expect(flux).toContainText("Meniu");
  await expect(flux).toContainText("Preferință primită");
  await expect(flux).toContainText("Mese");
  await expect(flux).toContainText("Cer alocare");
  await expect(flux).toContainText("Transport");
  await expect(flux).toContainText("Cerere primită");
  await expect(flux).toContainText("Urmează să așezi oamenii la mese");

  // Planificarea arată ciclul real: propunerea revizuibilă, apoi planul aplicat.
  const planning = page.locator("#planificare");
  const proposalView = planning.getByRole("button", {
    name: "Propunere de plan",
  });
  const appliedView = planning.getByRole("button", { name: "Planul aplicat" });
  await expect(proposalView).toHaveAttribute("aria-pressed", "true");
  await expect(appliedView).toHaveAttribute("aria-pressed", "false");
  await expect(planning).toContainText("Obligatoriu");
  await expect(planning).toContainText("Motivul excluderii");
  await expect(planning).toContainText("Ce am presupus");
  await expect(planning).toContainText("De verificat");
  await expect(planning).toContainText("Lipsește: Foto-video");
  await expect(planning).toContainText(
    "Nimic nu devine plan definitiv până la aplicare",
  );

  await appliedView.click();
  await expect(appliedView).toHaveAttribute("aria-pressed", "true");
  await expect(proposalView).toHaveAttribute("aria-pressed", "false");
  await expect(planning).toContainText("Nealocat");
  await expect(planning).toContainText("Motivul blocării");
  await expect(planning).toContainText("Finalizarea așteaptă");
  await expect(planning).toContainText(
    "Toate sarcinile și După stare",
  );
  // Planul B nu mai este prezentat ca atașat etapei din plan.
  await expect(planning).not.toContainText("Plan B");

  // Editorul de invitații este prezentat la nivelul capabilității reale.
  const invitations = page.locator("#invitatii");
  await expect(invitations).toContainText("14 tipuri");
  await expect(invitations).toContainText("Imagine hero");
  await expect(invitations).toContainText("Inspector");
  await expect(invitations).toContainText("Paletă");

  // Lanțul comercial complet și limita de plăți sunt vizibile.
  await expect(fluxLocator(page, "#furnizori")).toContainText("Comparare");
  await expect(fluxLocator(page, "#furnizori")).toContainText("Rezervare");
  await expect(fluxLocator(page, "#furnizori")).toContainText(
    "Contract pregătit",
  );
  await expect(fluxLocator(page, "#furnizori")).toContainText(
    "Sarbato nu colectează și nu transferă plățile dintre organizatori și furnizori",
  );

  // Abonamentele au acțiuni oneste; alegerea și checkout-ul continuă în cont.
  const pricing = page.locator("#abonamente");
  await expect(pricing.getByText("Gratuit").first()).toBeVisible();
  await expect(pricing.getByText("7 €", { exact: true })).toBeVisible();
  await expect(pricing.getByText("17 €", { exact: true })).toBeVisible();
  await expect(
    pricing.getByRole("heading", { name: "Plus", exact: true }),
  ).toBeVisible();
  await expect(
    pricing.getByText("Până la 200 de invitați și 5 colaboratori"),
  ).toBeVisible();
  await expect(pricing.getByText("Alegi din cont").first()).toBeVisible();
  await expect(pricing.getByRole("link")).toHaveCount(4);
  await expect(
    pricing.getByRole("link", { name: "Începe gratuit" }),
  ).toHaveAttribute("href", "/create-account");
  await expect(
    pricing.getByRole("link", { name: "Începe cu Plus" }),
  ).toHaveAttribute("href", "/create-account");

  // FAQ: opt întrebări, prima deschidere funcționează.
  const faqs = page.locator("#intrebari details");
  await expect(faqs).toHaveCount(8);
  const faq = page
    .locator("details")
    .filter({ hasText: "Invitații trebuie să își creeze cont?" });
  await expect(faq).not.toHaveAttribute("open", "");
  await faq.locator("summary").click();
  await expect(faq).toHaveAttribute("open", "");
  await expect(faq.getByText(/Folosesc linkul primit/)).toBeVisible();

  await expectNoHorizontalOverflow(page);
  await expectSoundHeadingStructure(page);
  await expectNoAxeViolations(page);
  await capture(page, testInfo, "landing-desktop-fallback");
  expect(browserErrors).toEqual([]);
});

function fluxLocator(page: Page, id: string) {
  return page.locator(id);
}

test("landing mobil — meniu, ordine semantică și reduced motion", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Fiecare eveniment are sute de detalii. Sarbato le ține împreună.",
    }),
  ).toBeVisible();
  await expect(publicSections(page)).toHaveCount(10);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Sari la conținut" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#continut$/);
  await expect(page.locator("main#continut")).toBeFocused();

  await dismissCookieBanner(page);

  await page.getByRole("button", { name: "Deschide meniul" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Navigație mobilă" });
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole("link", { name: "Cum funcționează" }).click();
  await expect(mobileNav).toBeHidden();
  await expect(page).toHaveURL(/#flux$/);

  const flowSteps = page.locator("#flux ol > li");
  await expect(flowSteps).toHaveCount(7);
  await expect(flowSteps.first()).toContainText("Plan");
  await expect(flowSteps.last()).toContainText("Ziua evenimentului");

  const eventDayStep = page
    .locator("#flux")
    .getByRole("button", { name: "Ziua evenimentului" });
  await eventDayStep.click();
  await expect(eventDayStep).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#flux")).toContainText(
    "În ziua nunții, toată echipa vede același plan",
  );

  const pricingCards = page.locator("#abonamente article");
  await expect(pricingCards).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await expect(pricingCards.nth(index)).toBeVisible();
  }

  await expectNoHorizontalOverflow(page);
  await expectSoundHeadingStructure(page);
  await expectNoAxeViolations(page);
  await capture(page, testInfo, "landing-mobile-fallback");
  expect(browserErrors).toEqual([]);
});

for (const viewport of [
  { name: "phone-320", width: 320, height: 720 },
  { name: "phone-360", width: 360, height: 800 },
  { name: "phone-390", width: 390, height: 844 },
  { name: "phone-430", width: 430, height: 932 },
  { name: "header-before-520", width: 519, height: 900 },
  { name: "header-at-520", width: 520, height: 900 },
  { name: "large-phone-600", width: 600, height: 960 },
  { name: "sm-before-640", width: 639, height: 960 },
  { name: "sm-at-640", width: 640, height: 960 },
  { name: "tablet-before-768", width: 767, height: 1024 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-820", width: 820, height: 1180 },
  { name: "phone-landscape", width: 844, height: 390 },
  { name: "lg-before-1024", width: 1023, height: 768 },
  { name: "laptop-1024", width: 1024, height: 768 },
  { name: "invitation-before-1120", width: 1119, height: 800 },
  { name: "invitation-at-1120", width: 1120, height: 800 },
  { name: "xl-before-1280", width: 1279, height: 900 },
  { name: "desktop-1280", width: 1280, height: 900 },
  { name: "desktop-1440", width: 1440, height: 1000 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-2560", width: 2560, height: 1440 },
] as const) {
  test(`landing ${viewport.name} — fără overflow și cu toate secțiunile`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(publicSections(page)).toHaveCount(10);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const invitationSurface = page.locator("#invitatii [role='group']").first();
    const invitationWidths = await invitationSurface.evaluate((surface) => ({
      clientWidth: surface.clientWidth,
      scrollWidth: surface.scrollWidth,
    }));
    expect(
      invitationWidths.scrollWidth,
      `Editorul invitației este tăiat la ${viewport.width}px`,
    ).toBeLessThanOrEqual(invitationWidths.clientWidth + 1);

    // Ambele stări ale panoului de planificare încap în coloana lor.
    await dismissCookieBanner(page);
    const planningPanel = page.locator("#planificare-panou");
    for (const view of ["Propunere de plan", "Planul aplicat"] as const) {
      await page
        .locator("#planificare")
        .getByRole("button", { name: view })
        .click();
      const panelWidths = await planningPanel.evaluate((panel) => ({
        clientWidth: panel.clientWidth,
        scrollWidth: panel.scrollWidth,
      }));
      expect(
        panelWidths.scrollWidth,
        `Panoul „${view}” este tăiat la ${viewport.width}px`,
      ).toBeLessThanOrEqual(panelWidths.clientWidth + 1);
    }

    const pricingWidths = await page
      .locator("#abonamente [aria-label='Comparație abonamente Sarbato']")
      .evaluate((plans) => ({
        clientWidth: plans.clientWidth,
        scrollWidth: plans.scrollWidth,
        display: getComputedStyle(plans).display,
      }));
    expect(pricingWidths.display).toBe("grid");
    expect(pricingWidths.scrollWidth).toBeLessThanOrEqual(
      pricingWidths.clientWidth + 1,
    );
  });
}
