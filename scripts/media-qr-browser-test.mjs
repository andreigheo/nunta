import { chromium, expect } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
const require = createRequire(
  new URL("../apps/worker/package.json", import.meta.url),
);
const sharp = require("sharp");
const fixture = JSON.parse(
  await readFile(
    process.env.MEDIA_QR_FIXTURE_PATH ??
      "/tmp/sarbato-media-qr-fixture-20260906.json",
    "utf8",
  ),
);
const base = process.env.MEDIA_QR_BASE_URL ?? "http://127.0.0.1:43241";
const output =
  process.env.MEDIA_QR_SCREENSHOT_DIR ??
  "/tmp/sarbato-media-qr-browser-20260906";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const guest = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  guest.setDefaultTimeout(15_000);
  const page = await guest.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/event-upload#${fixture.token}`);
  await expect(
    page.getByRole("heading", { name: "Adaugă momentele tale" }),
  ).toBeVisible({ timeout: 90_000 });
  expect(new URL(page.url()).hash).toBe("");
  const name = `browser-${Date.now()}.png`;
  const buffer = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#55a780" },
  })
    .png()
    .toBuffer();
  const videoName = name.replace(/png$/, "mp4");
  execFileSync("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x55a780:s=320x240:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    `${output}/sample.mp4`,
  ]);
  const video = await readFile(`${output}/sample.mp4`);
  const uploads = [];
  page.on("response", async (response) => {
    if (
      new URL(response.url()).pathname === "/api/v1/event-media/uploads" &&
      response.ok()
    )
      uploads.push(await response.json());
  });
  await page
    .getByLabel("Selectează din galerie", { exact: true })
    .setInputFiles([
      { name, mimeType: "image/png", buffer },
      { name: videoName, mimeType: "video/mp4", buffer: video },
    ]);
  await page
    .getByLabel("Numele tău (opțional)", { exact: true })
    .fill("Participant test");
  // Simulate a failed connection once, then use the participant's retry action.
  await page.route(
    "**/event-media/uploads",
    (route) => route.abort("internetdisconnected"),
    { times: 1 },
  );
  await page
    .getByRole("button", { name: "Trimite materialele", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reîncearcă", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reîncearcă", exact: true }).click();
  await expect(
    page.getByText("Mulțumim. 2 materiale au ajuns la organizator."),
  ).toBeVisible({ timeout: 60_000 });
  console.log("Participant upload and retry passed.");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/participant-${width}.png`,
      fullPage: true,
    });
  }
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  owner.setDefaultTimeout(15_000);
  await owner.addCookies([
    {
      name: "weddingos_session",
      value: fixture.cookie.split("=")[1],
      url: base,
    },
  ]);
  const dashboard = await owner.newPage();
  dashboard.on("pageerror", (error) => errors.push(error.message));
  await dashboard.goto(`${base}/moments`);
  await expect(
    dashboard.getByRole("heading", {
      name: "Momentele evenimentului",
      exact: true,
    }),
  ).toBeVisible({ timeout: 90_000 });
  const startGallery = dashboard.getByRole("button", {
    name: "Pornește galeria",
    exact: true,
  });
  if (await startGallery.isVisible()) await startGallery.click();
  else
    await expect(
      dashboard.getByRole("button", {
        name: "Oprește galeria",
        exact: true,
      }),
    ).toBeVisible();
  await expect(
    dashboard.getByText(/materiale aprobate sunt vizibile/),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("button", { name: `Deschide ${name}`, exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await dashboard
    .getByRole("button", { name: `Deschide ${name}`, exact: true })
    .click();
  await expect(
    dashboard.getByRole("button", { name: "Aprobă", exact: true }),
  ).toBeEnabled({ timeout: 60_000 });
  await dashboard.getByRole("button", { name: "Aprobă", exact: true }).click();
  await expect(
    dashboard.getByRole("button", { name: "Ascunde", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "Galerie live", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("radio", { name: "Galerie live", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Deschide momentul 1 de la Participant test",
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: `${output}/participant-gallery-390.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Deschide momentul 1 de la Participant test",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: /Prezentarea galeriei/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/participant-gallery-presentation-390.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Închide prezentarea" }).click();
  await dashboard
    .getByRole("button", { name: `Deschide ${videoName}`, exact: true })
    .click();
  await expect(dashboard.locator("video")).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(() => dashboard.locator("video").evaluate((el) => el.readyState), {
      timeout: 30_000,
    })
    .toBeGreaterThanOrEqual(1);
  await dashboard.locator("video").evaluate((video) => video.play());
  await expect
    .poll(() => dashboard.locator("video").evaluate((video) => video.ended), {
      timeout: 10_000,
    })
    .toBe(true);
  // A still-valid staging PUT cannot replace the verified original served to the owner.
  for (const upload of uploads.filter((item) => item.upload)) {
    const response = await owner.request.get(
      `${base}/api/v1/workspaces/${fixture.workspaceId}/media-portals/moments/${upload.momentId}/download`,
    );
    expect(response.ok()).toBe(true);
    const signed = (await response.json()).data.url;
    expect(signed).toContain("guest-moment-originals");
    const before = Buffer.from(await (await fetch(signed)).arrayBuffer());
    await fetch(upload.upload.url, {
      method: "PUT",
      headers: upload.upload.headers,
      body: "modified after scan",
    });
    expect(
      Buffer.from(await (await fetch(signed)).arrayBuffer()).equals(before),
    ).toBe(true);
  }
  for (const width of [1440, 768, 390]) {
    await dashboard.setViewportSize({ width, height: 1000 });
    expect(
      await dashboard.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dashboard.evaluate(() => scrollTo(0, 0));
    await dashboard.screenshot({
      path: `${output}/organizer-${width}.png`,
      fullPage: true,
    });
  }
  await dashboard.evaluate(() => {
    localStorage.setItem("weddingos-theme", "dark");
    window.dispatchEvent(new Event("weddingos-theme-change"));
  });
  await dashboard.screenshot({
    path: `${output}/organizer-dark.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  // Corrupted image headers must produce a rejected item, not an eternal spinner.
  const corrupt = buffer.subarray(0, 60);
  const uploadToken = randomBytes(32).toString("base64url");
  const started = await guest.request.post(
    `${base}/api/v1/event-media/uploads`,
    {
      headers: { Authorization: `Bearer ${fixture.token}`, Origin: base },
      data: {
        uploadToken,
        consent: true,
        mediaType: "IMAGE",
        contentType: "image/png",
        originalFileName: "corrupted.png",
        sizeBytes: corrupt.length,
        checksumSha256: createHash("sha256").update(corrupt).digest("hex"),
      },
    },
  );
  expect(started.ok()).toBe(true);
  const session = await started.json();
  await fetch(session.upload.url, {
    method: "PUT",
    headers: session.upload.headers,
    body: corrupt,
  });
  expect(
    (
      await guest.request.post(
        `${base}/api/v1/event-media/uploads/${session.momentId}/complete`,
        {
          headers: { Authorization: `Bearer ${fixture.token}`, Origin: base },
          data: { uploadToken },
        },
      )
    ).ok(),
  ).toBe(true);
  await expect
    .poll(
      async () => {
        const result = await owner.request.get(
          `${base}/api/v1/workspaces/${fixture.workspaceId}/guest-moments`,
        );
        return (await result.json()).data.items.find(
          (item) => item.id === session.momentId,
        )?.status;
      },
      { timeout: 60_000 },
    )
    .toBe("REJECTED");
  console.log(
    "PASS: image/video upload and playback, network retry, scan/approval, same-QR live gallery, immutable original, corrupt-file rejection, responsive layout and dark mode, no JS errors.",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
