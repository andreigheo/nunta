import { expect, test } from "@playwright/test";

const chapters = [
  "planificare",
  "invitatii",
  "furnizori",
  "ziua-evenimentului",
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Doar esențiale" }).click();
});

test("navigarea publică descrie destinațiile reale", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", {
    name: "Navigație principală",
    exact: true,
  });
  await expect(
    nav.getByRole("link", { name: "Contact", exact: true }),
  ).toHaveAttribute("href", "/contact");
  await expect(nav.getByRole("link", { name: "Despre noi" })).toHaveAttribute(
    "href",
    "/despre-noi",
  );
  await expect(nav.locator("svg")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toContainText(
    "Necesită autentificare",
  );

  for (const id of chapters) {
    await page.goto("/");
    const link = page.locator(`#${id} [data-story-copy] a`);
    await expect(link).toHaveAttribute("href", `/produs#${id}`);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/produs#${id}$`));
    await expect
      .poll(async () =>
        page
          .locator(`#${id}`)
          .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      )
      .toBeGreaterThanOrEqual(72);
    await expect
      .poll(async () =>
        page
          .locator(`#${id}`)
          .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      )
      .toBeLessThan(200);
  }
});

test("demonstrațiile nu oferă controale fără acțiune", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[class*="mobileNextStep"]')).toBeHidden();
  await expect(page.locator('[class*="mobileOperationsSummary"]')).toBeHidden();
  await expect(page.locator("#solutii button:not([disabled])")).toHaveCount(0);
  await expect(page.locator('#produs input[type="search"]')).toHaveCount(0);
  for (const id of chapters) {
    await expect(page.locator(`#${id}`)).toContainText("Exemplu demonstrativ");
  }
  const metricLinks = page.locator('#produs a[class*="metricLink"]');
  expect(
    await metricLinks.evaluateAll((links) =>
      links.every((link) => link.getAttribute("href")?.startsWith("/produs#")),
    ),
  ).toBe(true);
});

for (const width of [320, 360, 390, 768, 820]) {
  test(`mobil ${width}: conținut complet, FAQ și comparație fără glisare`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const id of chapters) {
      await expect(page.locator(`#${id} [data-story-copy] > p`)).toBeVisible();
      await expect(page.locator(`#${id} [data-story-copy] > a`)).toBeVisible();
    }
    await expect(page.locator("#intrebari h2")).toBeVisible();
    const summaries = page.locator("#intrebari summary");
    await expect(summaries).toHaveCount(7);
    for (const summary of await summaries.all())
      await expect(summary).toBeVisible();
    const last = page.locator("#intrebari details").last();
    await last.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(last).toHaveAttribute("open", "");
    await expect(last.locator("p")).toBeVisible();
    const cards = page.locator('#furnizori [class*="vendorCards"]');
    await expect(cards.locator("article")).toHaveCount(3);
    expect(
      await cards.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    for (const card of await cards.locator("article").all()) {
      const box = await card.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  });
}

test("headerul rămâne lizibil la trecerea între dimensiuni", async ({
  page,
}) => {
  for (const width of [820, 900, 1024, 1100, 1101, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const menu = page.getByRole("button", { name: "Deschide meniul" });
    if (width <= 1100) {
      await menu.click();
      const nav = page.getByRole("navigation", { name: "Navigație mobilă" });
      await expect(
        nav.getByRole("link", { name: "Contact", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(nav).toBeHidden();
      await expect(menu).toBeFocused();
    } else await expect(menu).toBeHidden();
    const sizes = await page
      .locator("header a")
      .evaluateAll((links) =>
        links
          .filter((link) => link.getBoundingClientRect().height)
          .map((link) => parseFloat(getComputedStyle(link).fontSize)),
      );
    expect(sizes.every((size) => size >= 14)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
  }
  await page.setViewportSize({ width: 900, height: 900 });
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    page.getByRole("navigation", { name: "Navigație mobilă" }),
  ).toBeHidden();
});
