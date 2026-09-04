import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const environmentBoolean = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return value;
}, z.boolean());

export const apiEnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "staging", "beta", "production"])
      .default("development"),
    WEB_URL: z.string().url(),
    API_URL: z.string().url(),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    BIND_HOST: z.string().min(1).default("127.0.0.1"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
    DATABASE_URL: z.string().min(1),
    DATABASE_PURPOSE: z
      .enum([
        "persistent-runtime",
        "integration",
        "e2e",
        "restore-target",
        "staging",
        "controlled-beta",
        "production",
      ])
      .default("persistent-runtime"),
    STORAGE_PURPOSE: z
      .enum([
        "persistent-runtime",
        "integration",
        "e2e",
        "staging",
        "controlled-beta",
        "production",
      ])
      .default("persistent-runtime"),
    DATABASE_OWNER_URL: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    SESSION_SECRET: z.string().min(32),
    MFA_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .default("weddingos-local-mfa-encryption-key-change-production"),
    MFA_ENCRYPTION_KEY_ID: z.string().min(1).default("local-mfa-v1"),
    MFA_TOTP_ISSUER: z.string().min(1).max(80).default("Sarbato"),
    ADMIN_STEP_UP_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(900)
      .default(600),
    CSRF_ENFORCEMENT: environmentBoolean.default(true),
    CSRF_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(7200)
      .default(1800),
    COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().optional()),
    SESSION_COOKIE_NAME: z.string().min(1).default("weddingos_session"),
    EMAIL_FROM: z.string().min(3),
    EMAIL_PROVIDER: z.enum(["smtp", "console"]).default("smtp"),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:56379"),
    OUTBOX_ENCRYPTION_KEY: z.string().min(32),
    OUTBOX_ENCRYPTION_KEY_ID: z.string().min(1).max(80).default("local-v1"),
    OUTBOX_DECRYPTION_KEYS: z.string().default("{}"),
    OUTBOX_COMMAND_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(2_592_000)
      .default(604_800),
    ARTIFACT_ROOT: z.string().min(1).default("ops/artifacts/activity-exports"),
    ARTIFACT_RETENTION_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(720)
      .default(24),
    ARTIFACT_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(52_428_800)
      .default(5_242_880),
    ARTIFACT_MAX_ROWS: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(10_000),
    PLAN_GENERATION_PROVIDER_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    PLAN_GENERATION_PROVIDER_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    PLAN_GENERATION_PROVIDER_MODEL: z.string().min(1).default("configured"),
    COPILOT_EXTERNAL_ENABLED: environmentBoolean.default(false),
    COPILOT_EXTERNAL_DATA_ALLOWED: environmentBoolean.default(false),
    COPILOT_PROVIDER_PROTOCOL: z
      .enum(["generic-json", "openrouter-chat"])
      .default("openrouter-chat"),
    COPILOT_PROVIDER_ENDPOINT: z.preprocess(
      emptyToUndefined,
      z.string().url().default("https://openrouter.ai/api/v1/chat/completions"),
    ),
    COPILOT_PROVIDER_API_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    COPILOT_PROVIDER_MODEL: z.string().min(1).default("openai/gpt-5.6-luna"),
    COPILOT_MAX_CONTEXT_BYTES: z.coerce
      .number()
      .int()
      .min(8_000)
      .max(256_000)
      .default(64_000),
    COPILOT_DAILY_COST_LIMIT_MINOR: z.coerce.number().int().min(1).default(500),
    COPILOT_MAX_RUN_COST_MINOR: z.coerce.number().int().min(1).default(25),
    COPILOT_INPUT_COST_MINOR_PER_MILLION: z.coerce.number().min(0).default(10),
    COPILOT_OUTPUT_COST_MINOR_PER_MILLION: z.coerce.number().min(0).default(60),
    COPILOT_WEB_SEARCH_COST_MINOR: z.coerce.number().int().min(0).default(1),
    COPILOT_EMBEDDING_ENABLED: environmentBoolean.default(false),
    COPILOT_EMBEDDING_ENDPOINT: z
      .string()
      .url()
      .default("https://api.openai.com/v1/embeddings"),
    COPILOT_EMBEDDING_API_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional(),
    ),
    COPILOT_EMBEDDING_MODEL: z
      .string()
      .min(1)
      .default("text-embedding-3-small"),
    OBJECT_STORAGE_PROVIDER: z.enum(["minio", "s3"]).default("minio"),
    OBJECT_STORAGE_ENDPOINT: z.string().url().default("http://127.0.0.1:59000"),
    OBJECT_STORAGE_PUBLIC_ENDPOINT: z
      .string()
      .url()
      .default("http://127.0.0.1:59000"),
    OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
    OBJECT_STORAGE_BUCKET: z.string().min(3).default("weddingos-private"),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(3).default("weddingos"),
    OBJECT_STORAGE_SECRET_KEY: z
      .string()
      .min(8)
      .default("weddingos-local-secret"),
    OBJECT_STORAGE_FORCE_PATH_STYLE: environmentBoolean.default(true),
    OBJECT_STORAGE_UPLOAD_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    OBJECT_STORAGE_DOWNLOAD_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(900)
      .default(300),
    DOCUMENT_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(104_857_600)
      .default(26_214_400),
    PORTFOLIO_IMAGE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(52_428_800)
      .default(15_728_640),
    CLAMAV_HOST: z.string().min(1).default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(53310),
    CLAMAV_SCAN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(120_000)
      .default(30_000),
    SIGNATURE_PROVIDER: z
      .enum(["fake", "configured", "disabled"])
      .default("fake"),
    SIGNATURE_PROVIDER_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    SIGNATURE_PROVIDER_SECRET: z
      .string()
      .min(16)
      .default("weddingos-signature-local-secret"),
    PAYMENT_PROVIDER: z
      .enum(["fake", "configured", "disabled"])
      .default("fake"),
    PAYMENT_PROVIDER_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    PAYMENT_PROVIDER_SECRET: z
      .string()
      .min(16)
      .default("weddingos-payment-local-secret"),
    SUBSCRIPTION_PROVIDER: z
      .enum(["fake", "configured", "disabled"])
      .default("fake"),
    SUBSCRIPTION_PROVIDER_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    SUBSCRIPTION_PROVIDER_SECRET: z
      .string()
      .min(16)
      .default("weddingos-subscription-local-secret"),
    WORKSPACE_BILLING_PROVIDER: z
      .enum(["disabled", "paddle"])
      .default("disabled"),
    PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    PADDLE_API_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(16).optional(),
    ),
    PADDLE_CLIENT_TOKEN: z.preprocess(
      emptyToUndefined,
      z.string().min(8).optional(),
    ),
    PADDLE_WEBHOOK_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(16).optional(),
    ),
    PADDLE_CHECKOUT_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    PADDLE_PLUS_PRICE_ID: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^pri_[A-Za-z0-9]+$/)
        .optional(),
    ),
    PADDLE_PRO_PRICE_ID: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^pri_[A-Za-z0-9]+$/)
        .optional(),
    ),
    PADDLE_WEBHOOK_TOLERANCE_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(900)
      .default(300),
    WORKSPACE_BILLING_GRACE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(168)
      .default(72),
    PAYOUT_PROVIDER: z.enum(["fake", "configured", "disabled"]).default("fake"),
    PAYOUT_PROVIDER_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    PAYOUT_PROVIDER_SECRET: z
      .string()
      .min(16)
      .default("weddingos-payout-local-secret"),
    REVIEW_EDIT_WINDOW_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(365)
      .default(30),
    SUBSCRIPTION_GRACE_PERIOD_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(7),
    PAYOUT_HOLD_DAYS: z.coerce.number().int().min(0).max(180).default(7),
    PAYOUT_MINIMUM_MINOR: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000_000)
      .default(10_000),
    PROVIDER_WEBHOOK_TOLERANCE_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(900)
      .default(300),
    WORKER_STALE_AFTER_SECONDS: z.coerce
      .number()
      .int()
      .min(5)
      .max(3600)
      .default(45),
    MARKETING_SNAPSHOT_INTERVAL_SECONDS: z.coerce
      .number()
      .int()
      .min(900)
      .max(900)
      .default(900),
    MARKETING_SNAPSHOT_WINDOW_DAYS: z.coerce
      .number()
      .int()
      .min(365)
      .max(365)
      .default(365),
    MARKETING_SNAPSHOT_MIN_COHORT: z.coerce
      .number()
      .int()
      .min(20)
      .max(10_000)
      .default(20),
    MARKETING_SNAPSHOT_MAX_STALE_SECONDS: z.coerce
      .number()
      .int()
      .min(86_400)
      .max(86_400)
      .default(86_400),
    LOG_LEVEL: z.enum([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent",
    ]),
    METRICS_TOKEN: z.string().min(24).default("weddingos-local-metrics-token"),
    FEATURE_MAGIC_LINK_ENABLED: environmentBoolean.default(true),
    FEATURE_MFA_ENABLED: environmentBoolean.default(false),
    BETA_RELEASE_VERSION: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^beta\.\d+$/)
        .optional(),
    ),
    BETA_PUBLIC_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    BETA_ALERT_DESTINATION_URL: z.preprocess(
      emptyToUndefined,
      z.string().url().optional(),
    ),
    BETA_BACKUP_DESTINATION: z.preprocess(
      emptyToUndefined,
      z.string().min(8).optional(),
    ),
    BETA_ANALYTICS_ENABLED: environmentBoolean.default(false),
  })
  .superRefine((env, context) => {
    if (env.COPILOT_MAX_RUN_COST_MINOR > env.COPILOT_DAILY_COST_LIMIT_MINOR) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["COPILOT_MAX_RUN_COST_MINOR"],
        message:
          "Maximum Copilot run cost reservation cannot exceed the daily workspace budget.",
      });
    }
    if (
      env.NODE_ENV === "production" ||
      env.NODE_ENV === "staging" ||
      env.NODE_ENV === "beta"
    ) {
      if (env.SESSION_SECRET.includes("replace-with")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SESSION_SECRET"],
          message: "SESSION_SECRET must be a real secret in production.",
        });
      }
      if (
        env.API_URL.startsWith("http://") ||
        env.WEB_URL.startsWith("http://")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["API_URL"],
          message: "Production WEB_URL and API_URL must use HTTPS.",
        });
      }
      if (
        env.NODE_ENV === "production" &&
        !env.REDIS_URL.startsWith("rediss://")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "Production Redis must use TLS (rediss://).",
        });
      }
      if (env.NODE_ENV === "production") {
        const requiredProductionState: Array<
          [keyof typeof env, boolean, string]
        > = [
          [
            "DATABASE_PURPOSE",
            env.DATABASE_PURPOSE === "production",
            "Production must use a database explicitly marked for production.",
          ],
          [
            "STORAGE_PURPOSE",
            env.STORAGE_PURPOSE === "production",
            "Production must use storage explicitly marked for production.",
          ],
          [
            "EMAIL_PROVIDER",
            env.EMAIL_PROVIDER === "smtp",
            "Production transactional email must use authenticated SMTP.",
          ],
          [
            "SMTP_USER",
            Boolean(env.SMTP_USER),
            "Production transactional email requires an SMTP user.",
          ],
          [
            "SMTP_PASSWORD",
            Boolean(env.SMTP_PASSWORD),
            "Production transactional email requires an SMTP password.",
          ],
          [
            "SIGNATURE_PROVIDER",
            env.SIGNATURE_PROVIDER !== "fake",
            "Production document signatures must be configured or disabled.",
          ],
        ];
        for (const [path, valid, message] of requiredProductionState) {
          if (!valid) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path],
              message,
            });
          }
        }

        const forbiddenFinancialProviders: Array<
          [keyof typeof env, string, string]
        > = [
          [
            "PAYMENT_PROVIDER",
            env.PAYMENT_PROVIDER,
            "Production couple-to-vendor payment processing must remain disabled.",
          ],
          [
            "SUBSCRIPTION_PROVIDER",
            env.SUBSCRIPTION_PROVIDER,
            "Production vendor subscription processing must remain disabled.",
          ],
          [
            "PAYOUT_PROVIDER",
            env.PAYOUT_PROVIDER,
            "Production vendor payouts must remain disabled.",
          ],
        ];
        for (const [path, value, message] of forbiddenFinancialProviders) {
          if (value !== "disabled")
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path],
              message,
            });
        }

        const forbiddenMarker =
          /(local|test|staging|change-before|change-production|replace-with|weddingos)/i;
        const protectedValues: Array<[keyof typeof env, string | undefined]> = [
          ["SESSION_SECRET", env.SESSION_SECRET],
          ["MFA_ENCRYPTION_KEY", env.MFA_ENCRYPTION_KEY],
          ["OUTBOX_ENCRYPTION_KEY", env.OUTBOX_ENCRYPTION_KEY],
          ["OBJECT_STORAGE_ACCESS_KEY", env.OBJECT_STORAGE_ACCESS_KEY],
          ["OBJECT_STORAGE_SECRET_KEY", env.OBJECT_STORAGE_SECRET_KEY],
          ["SMTP_PASSWORD", env.SMTP_PASSWORD],
          ["METRICS_TOKEN", env.METRICS_TOKEN],
          ["COPILOT_PROVIDER_API_KEY", env.COPILOT_PROVIDER_API_KEY],
          ["COPILOT_EMBEDDING_API_KEY", env.COPILOT_EMBEDDING_API_KEY],
        ];
        for (const [path, value] of protectedValues) {
          if (
            (path === "COPILOT_PROVIDER_API_KEY" &&
              !env.COPILOT_EXTERNAL_ENABLED) ||
            (path === "COPILOT_EMBEDDING_API_KEY" &&
              !env.COPILOT_EMBEDDING_ENABLED)
          )
            continue;
          if (!value || forbiddenMarker.test(value)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path],
              message:
                "Production rejects default, local, test and staging credential markers.",
            });
          }
        }
      }
      if (!new URL(env.REDIS_URL).password) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "Production Redis must use authentication.",
        });
      }
      if (
        env.PLAN_GENERATION_PROVIDER_URL &&
        !env.PLAN_GENERATION_PROVIDER_KEY
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PLAN_GENERATION_PROVIDER_KEY"],
          message:
            "Configured plan provider requires an API key in production.",
        });
      }
      if (env.COPILOT_EMBEDDING_ENABLED && !env.COPILOT_EMBEDDING_API_KEY) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_EMBEDDING_API_KEY"],
          message: "Semantic Copilot memory requires an embedding API key.",
        });
      }
      if (
        env.COPILOT_EXTERNAL_ENABLED &&
        (!env.COPILOT_PROVIDER_ENDPOINT || !env.COPILOT_PROVIDER_API_KEY)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_PROVIDER_ENDPOINT"],
          message:
            "External Copilot requires both a provider endpoint and API key.",
        });
      }
      if (
        env.COPILOT_EXTERNAL_ENABLED &&
        (env.COPILOT_INPUT_COST_MINOR_PER_MILLION <= 0 ||
          env.COPILOT_OUTPUT_COST_MINOR_PER_MILLION <= 0)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_INPUT_COST_MINOR_PER_MILLION"],
          message:
            "External Copilot requires explicit non-zero model pricing for cost controls.",
        });
      }
      if (
        env.COPILOT_EXTERNAL_ENABLED &&
        env.COPILOT_PROVIDER_PROTOCOL === "openrouter-chat" &&
        new URL(env.COPILOT_PROVIDER_ENDPOINT).origin !==
          "https://openrouter.ai"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_PROVIDER_ENDPOINT"],
          message:
            "OpenRouter protocol requires an endpoint hosted on openrouter.ai.",
        });
      }
      if (
        env.COPILOT_EXTERNAL_ENABLED &&
        env.COPILOT_PROVIDER_ENDPOINT &&
        !env.COPILOT_PROVIDER_ENDPOINT.startsWith("https://")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_PROVIDER_ENDPOINT"],
          message: "Production Copilot provider must use HTTPS.",
        });
      }
      if (
        env.COPILOT_EMBEDDING_ENABLED &&
        !env.COPILOT_EMBEDDING_ENDPOINT.startsWith("https://")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["COPILOT_EMBEDDING_ENDPOINT"],
          message: "Production Copilot embeddings must use HTTPS.",
        });
      }
      if (
        env.OBJECT_STORAGE_PROVIDER === "s3" &&
        !env.OBJECT_STORAGE_ENDPOINT.startsWith("https://")
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OBJECT_STORAGE_ENDPOINT"],
          message: "Production S3 storage must use HTTPS.",
        });
      }
      if (
        env.SIGNATURE_PROVIDER === "configured" &&
        !env.SIGNATURE_PROVIDER_URL
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SIGNATURE_PROVIDER_URL"],
          message: "Configured signature provider requires an HTTPS endpoint.",
        });
      }
      if (env.PAYMENT_PROVIDER === "configured" && !env.PAYMENT_PROVIDER_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYMENT_PROVIDER_URL"],
          message: "Configured payment provider requires an HTTPS endpoint.",
        });
      }
      if (
        env.SUBSCRIPTION_PROVIDER === "configured" &&
        !env.SUBSCRIPTION_PROVIDER_URL
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SUBSCRIPTION_PROVIDER_URL"],
          message:
            "Configured subscription provider requires an HTTPS endpoint.",
        });
      }
      if (env.WORKSPACE_BILLING_PROVIDER === "paddle") {
        const requiredPaddle: Array<
          [keyof typeof env, string | undefined, string]
        > = [
          ["PADDLE_API_KEY", env.PADDLE_API_KEY, "Paddle API key is required."],
          [
            "PADDLE_CLIENT_TOKEN",
            env.PADDLE_CLIENT_TOKEN,
            "Paddle client token is required.",
          ],
          [
            "PADDLE_WEBHOOK_SECRET",
            env.PADDLE_WEBHOOK_SECRET,
            "Paddle webhook secret is required.",
          ],
          [
            "PADDLE_PLUS_PRICE_ID",
            env.PADDLE_PLUS_PRICE_ID,
            "Paddle Plus price ID is required.",
          ],
          [
            "PADDLE_PRO_PRICE_ID",
            env.PADDLE_PRO_PRICE_ID,
            "Paddle Pro price ID is required.",
          ],
        ];
        for (const [path, value, message] of requiredPaddle) {
          if (!value)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: [path],
              message,
            });
        }
        if (
          env.PADDLE_ENVIRONMENT === "production" &&
          env.PADDLE_CHECKOUT_URL &&
          !env.PADDLE_CHECKOUT_URL.startsWith("https://")
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["PADDLE_CHECKOUT_URL"],
            message: "Live Paddle checkout URL must use HTTPS.",
          });
        }
        if (
          env.NODE_ENV === "production" &&
          env.PADDLE_ENVIRONMENT !== "production"
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["PADDLE_ENVIRONMENT"],
            message: "Production billing cannot use Paddle sandbox.",
          });
        }
      }
      if (env.PAYOUT_PROVIDER === "configured" && !env.PAYOUT_PROVIDER_URL) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["PAYOUT_PROVIDER_URL"],
          message: "Configured payout provider requires an HTTPS endpoint.",
        });
      }
    }
    if (env.NODE_ENV === "beta") {
      const required: Array<[keyof typeof env, unknown, string]> = [
        [
          "DATABASE_PURPOSE",
          env.DATABASE_PURPOSE === "controlled-beta",
          "Beta database purpose must be controlled-beta.",
        ],
        [
          "STORAGE_PURPOSE",
          env.STORAGE_PURPOSE === "controlled-beta",
          "Beta storage purpose must be controlled-beta.",
        ],
        [
          "BETA_RELEASE_VERSION",
          env.BETA_RELEASE_VERSION,
          "A beta release version such as beta.1 is required.",
        ],
        [
          "BETA_PUBLIC_URL",
          env.BETA_PUBLIC_URL?.startsWith("https://"),
          "The external beta URL must use HTTPS.",
        ],
        [
          "BETA_ALERT_DESTINATION_URL",
          env.BETA_ALERT_DESTINATION_URL?.startsWith("https://"),
          "A real HTTPS alert destination is required.",
        ],
        [
          "BETA_BACKUP_DESTINATION",
          env.BETA_BACKUP_DESTINATION,
          "An off-instance encrypted backup destination is required.",
        ],
        [
          "SMTP_USER",
          env.SMTP_USER,
          "Beta transactional email requires an authenticated SMTP user.",
        ],
        [
          "SMTP_PASSWORD",
          env.SMTP_PASSWORD,
          "Beta transactional email requires an authenticated SMTP password.",
        ],
      ];
      for (const [path, valid, message] of required) {
        if (!valid) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message,
          });
        }
      }
      if (env.OBJECT_STORAGE_PROVIDER !== "s3") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OBJECT_STORAGE_PROVIDER"],
          message: "Controlled beta must use external private object storage.",
        });
      }
      const forbiddenMarker =
        /(local|test|staging-only|change-before|replace-with)/i;
      const protectedValues: Array<[keyof typeof env, string | undefined]> = [
        ["SESSION_SECRET", env.SESSION_SECRET],
        ["MFA_ENCRYPTION_KEY", env.MFA_ENCRYPTION_KEY],
        ["OUTBOX_ENCRYPTION_KEY", env.OUTBOX_ENCRYPTION_KEY],
        ["OBJECT_STORAGE_ACCESS_KEY", env.OBJECT_STORAGE_ACCESS_KEY],
        ["OBJECT_STORAGE_SECRET_KEY", env.OBJECT_STORAGE_SECRET_KEY],
        ["SMTP_PASSWORD", env.SMTP_PASSWORD],
      ];
      for (const [path, value] of protectedValues) {
        if (!value || forbiddenMarker.test(value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message:
              "Controlled beta rejects local, test and staging credential markers.",
          });
        }
      }
    }
  });

export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;

export function parseApiEnvironment(source: NodeJS.ProcessEnv): ApiEnvironment {
  const result = apiEnvironmentSchema.safeParse(source);
  if (!result.success) {
    const summary = result.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`,
      )
      .join("; ");
    throw new Error(`Invalid API environment: ${summary}`);
  }
  return result.data;
}
