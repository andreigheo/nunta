import { expect, test } from "@playwright/test";

test("Despre noi: navigare, SVG nativ și destinații reale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Doar esențiale" }).click();
  const nav = page.getByRole("navigation", {
    name: "Navigație principală",
    exact: true,
  });
  await nav.getByRole("link", { name: "Despre noi" }).click();
  await expect(page).toHaveURL(/\/despre-noi$/);
  await expect(nav.getByRole("link", { name: "Despre noi" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main img, main svg image")).toHaveCount(0);
  await expect(page.locator('[data-about-art="hero"]')).toHaveAttribute(
    "role",
    "img",
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/despre-noi$/,
  );
  const hero = page.locator('section[aria-labelledby="about-title"]');
  await expect(
    hero.getByRole("link", { name: "Începe organizarea" }),
  ).toHaveAttribute("href", "/create-account");
  await hero.getByRole("link", { name: "Vezi produsul" }).click();
  await expect(page).toHaveURL(/\/produs$/);
});

test("Despre noi: redimensionare fără suprapuneri și meniu mobil", async ({
  page,
}) => {
  await page.goto("/despre-noi");
  await page.getByRole("button", { name: "Doar esențiale" }).click();
  for (const width of [320, 390, 760, 768, 862, 1100, 1101, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await expect(page.locator('[data-about-art="hero"]')).toBeVisible();
    const layout = await page
      .locator('[class*="peopleFlow"]')
      .evaluate((flow) => {
        const plan = flow
          .querySelector('[class*="commonPlan"]')!
          .getBoundingClientRect();
        const roles = [...flow.querySelectorAll("article p")].map(
          (el) => el.getBoundingClientRect().bottom,
        );
        return { plan: plan.top, lastText: Math.max(...roles) };
      });
    expect(layout.plan - layout.lastText).toBeGreaterThanOrEqual(16);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Deschide meniul" }).click();
  const mobileNav = page.getByRole("navigation", { name: "Navigație mobilă" });
  await expect(
    mobileNav.getByRole("link", { name: "Despre noi" }),
  ).toBeVisible();
  await mobileNav.getByRole("link", { name: "Contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contact$/);
  await expect(mobileNav).toBeHidden();
});
