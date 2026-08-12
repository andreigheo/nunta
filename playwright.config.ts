import { defineConfig, devices } from "@playwright/test";

process.env.DATABASE_PURPOSE = "e2e";
import { resolve } from "node:path";

const webUrl = "http://127.0.0.1:3117";
const apiUrl = "http://127.0.0.1:4117";
const artifactRoot =
  process.env.WEDDINGOS_E2E_ARTIFACT_ROOT ??
  resolve(process.cwd(), "ops/artifacts/e2e-activity-exports");
const webServerCommand = process.env.WEDDINGOS_E2E_REUSE_BUILD
  ? "env WEDDINGOS_E2E=true NEXT_DIST_DIR=.next-e2e API_INTERNAL_URL=http://127.0.0.1:4117 NEXT_PUBLIC_DEMO_MODE_ENABLED=true corepack pnpm exec next start --hostname 127.0.0.1 --port 3117"
  : "env WEDDINGOS_E2E=true NEXT_DIST_DIR=.next-e2e API_INTERNAL_URL=http://127.0.0.1:4117 NEXT_PUBLIC_DEMO_MODE_ENABLED=true sh -c 'corepack pnpm exec next build --webpack && exec corepack pnpm exec next start --hostname 127.0.0.1 --port 3117'";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: [
    "landing.spec.ts",
    "landing-proof.spec.ts",
    // The controlled-beta API and UI are intentionally excluded from the
    // production application. Its historical suite is not a browser gate.
    "controlled-beta.spec.ts",
  ],
  // The product grants VENDOR_PAYMENTS to no subscription plan. Keep the
  // historical provider lifecycle specs in source, outside the active gate.
  grepInvert: /\[inactive-vendor-payments\]/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/results.json" }],
    ["junit", { outputFile: "test-results/e2e-junit.xml" }],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
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
  webServer: [
    {
      command: `env NODE_ENV=test WEDDINGOS_TEST_DISABLE_THROTTLE=true WEB_URL=http://127.0.0.1:3117 API_URL=http://127.0.0.1:4117 PORT=4117 OTEL_TRACING_ENABLED=true OTEL_SERVICE_NAME=weddingos-api-e2e OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces SESSION_SECRET='e2e-session-secret-with-at-least-32-characters' SESSION_COOKIE_NAME=weddingos_session EMAIL_FROM='Sarbato <no-reply@sarbato.local>' EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025 REDIS_URL=redis://127.0.0.1:56379/15 OUTBOX_ENCRYPTION_KEY='weddingos-local-outbox-encryption-key-change-production' WORKER_STALE_AFTER_SECONDS=45 LOG_LEVEL=error FEATURE_MAGIC_LINK_ENABLED=true FEATURE_MFA_ENABLED=false CSRF_ENFORCEMENT=false ARTIFACT_ROOT='${artifactRoot}' OBJECT_STORAGE_PROVIDER=minio OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:59000 OBJECT_STORAGE_PUBLIC_ENDPOINT=http://127.0.0.1:59000 OBJECT_STORAGE_REGION=us-east-1 OBJECT_STORAGE_BUCKET=weddingos-e2e OBJECT_STORAGE_ACCESS_KEY=weddingos OBJECT_STORAGE_SECRET_KEY=weddingos-local-storage-secret OBJECT_STORAGE_FORCE_PATH_STYLE=true CLAMAV_HOST=127.0.0.1 CLAMAV_PORT=53310 SIGNATURE_PROVIDER=fake SIGNATURE_PROVIDER_SECRET=weddingos-signature-local-secret PAYMENT_PROVIDER=fake PAYMENT_PROVIDER_SECRET=weddingos-payment-local-secret corepack pnpm exec concurrently -k -s first -n api,worker \"env DATABASE_URL='postgresql://weddingos_app:weddingos_app@127.0.0.1:54339/weddingos_e2e?schema=public' DATABASE_OWNER_URL='postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public' corepack pnpm --filter @weddingos/api start\" \"env OTEL_SERVICE_NAME=weddingos-worker-e2e DATABASE_URL='postgresql://weddingos_worker:weddingos_worker@127.0.0.1:54339/weddingos_e2e?schema=public' corepack pnpm --filter @weddingos/worker start\"`,
      url: `${apiUrl}/ready`,
      timeout: 240_000,
      reuseExistingServer: false,
    },
    {
      command: webServerCommand,
      url: `${webUrl}/sign-in`,
      timeout: 900_000,
      reuseExistingServer: false,
    },
  ],
});
