import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.WEDDINGOS_LANDING_E2E_PORT ?? 3117);
const webUrl = `http://127.0.0.1:${port}`;
const distDir = process.env.NEXT_DIST_DIR ?? ".next-landing";
const apiInternalUrl =
  process.env.WEDDINGOS_LANDING_API_URL ?? "http://127.0.0.1:1";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "landing.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/landing",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `env NEXT_DIST_DIR=${distDir} API_INTERNAL_URL=${apiInternalUrl} pnpm exec next start --hostname 127.0.0.1 --port ${port}`,
    url: webUrl,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
