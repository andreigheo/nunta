import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1366, height: 768 },
  { name: "short desktop", width: 1024, height: 640 },
  { name: "compact mobile", width: 360, height: 640 },
  { name: "mobile", width: 390, height: 720 },
] as const;

for (const viewport of viewports) {
  test(`sign-in fits one ${viewport.name} viewport without page scroll`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/sign-in");

    await expect(
      page.getByRole("heading", { name: "Bine ai revenit" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Creează un cont" }),
    ).toBeVisible();

    const geometry = await page.evaluate(() => ({
      clientHeight: document.documentElement.clientHeight,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(geometry.scrollHeight).toBeLessThanOrEqual(
      geometry.clientHeight + 1,
    );
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  });
}

test("mobile auth keeps the shared artwork behind interactive content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/sign-in", "/create-account"] as const) {
    await page.goto(route);

    const artwork = page.locator('aside svg[viewBox="0 0 460 1040"]');
    await expect(artwork).toBeVisible();

    const background = await artwork.evaluate((element) => {
      const panel = element.closest("aside");
      const artworkContainer = element.parentElement;
      if (!panel || !artworkContainer) return null;
      return {
        opacity: Number.parseFloat(getComputedStyle(artworkContainer).opacity),
        pointerEvents: getComputedStyle(panel).pointerEvents,
        position: getComputedStyle(panel).position,
      };
    });

    expect(background).not.toBeNull();
    expect(background?.position).toBe("fixed");
    expect(background?.pointerEvents).toBe("none");
    expect(background?.opacity).toBeGreaterThan(0);
    expect(background?.opacity).toBeLessThanOrEqual(0.14);

    const documentWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(documentWidth).toBeLessThanOrEqual(390);
  }
});
