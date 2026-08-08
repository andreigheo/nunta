import { defineConfig, devices } from "@playwright/test";

const webPort = Number(process.env.WEDDINGOS_LANDING_PROOF_PORT ?? 3118);
const apiPort = Number(process.env.WEDDINGOS_LANDING_PROOF_API_PORT ?? 4017);
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const proofCacheNamespace = `landing-proof-${Date.now()}`;
const apiTestEnvironment = {
  NODE_ENV: "test",
  WEB_URL: webUrl,
  API_URL: apiUrl,
  PORT: String(apiPort),
  LOG_LEVEL: "silent",
  DATABASE_URL:
    "postgresql://weddingos_app:weddingos_app@127.0.0.1:54339/weddingos?schema=public",
  SESSION_SECRET: "landing-proof-test-session-secret-32-characters",
  SESSION_COOKIE_NAME: "weddingos_session",
  FEATURE_MAGIC_LINK_ENABLED: "true",
  FEATURE_MFA_ENABLED: "false",
  EMAIL_FROM: "WeddingOS <no-reply@weddingos.local>",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  REDIS_URL: "redis://127.0.0.1:56379",
  OUTBOX_ENCRYPTION_KEY:
    "weddingos-local-outbox-encryption-key-change-production",
  OUTBOX_ENCRYPTION_KEY_ID: "local-v1",
  OUTBOX_DECRYPTION_KEYS: "{}",
  WORKER_STALE_AFTER_SECONDS: "45",
  OBJECT_STORAGE_PROVIDER: "minio",
  OBJECT_STORAGE_ENDPOINT: "http://127.0.0.1:59000",
  OBJECT_STORAGE_PUBLIC_ENDPOINT: "http://127.0.0.1:59000",
  OBJECT_STORAGE_REGION: "us-east-1",
  OBJECT_STORAGE_BUCKET: "weddingos-private",
  OBJECT_STORAGE_ACCESS_KEY: "weddingos",
  OBJECT_STORAGE_SECRET_KEY: "weddingos-local-storage-secret",
  OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
  CLAMAV_HOST: "127.0.0.1",
  CLAMAV_PORT: "53310",
  SIGNATURE_PROVIDER: "fake",
  SIGNATURE_PROVIDER_SECRET: "weddingos-signature-local-secret",
  PAYMENT_PROVIDER: "fake",
  PAYMENT_PROVIDER_SECRET: "weddingos-payment-local-secret",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "landing-proof.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results/landing-proof",
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
      command: "node apps/api/dist/main.js",
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: apiTestEnvironment,
    },
    {
      command: `env NEXT_DIST_DIR=.next-landing-proof API_INTERNAL_URL=${apiUrl} WEDDINGOS_PUBLIC_PROOF_CACHE_NAMESPACE=${proofCacheNamespace} NEXT_PUBLIC_DEMO_MODE_ENABLED=true NEXT_DISABLE_DEV_INDICATORS=true pnpm exec next dev --webpack --hostname 127.0.0.1 --port ${webPort}`,
      // Do not prime the revalidated marketing page before the test fixture
      // creates its deterministic public-product-proof snapshot.
      url: `${webUrl}/sign-in`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
