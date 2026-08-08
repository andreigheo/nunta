import { createHash } from "node:crypto";

const required = [
  "BETA_RELEASE_VERSION",
  "BETA_PUBLIC_URL",
  "BETA_ALERT_DESTINATION_URL",
  "BETA_BACKUP_DESTINATION",
  "DATABASE_URL",
  "DATABASE_OWNER_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "OUTBOX_ENCRYPTION_KEY",
  "OBJECT_STORAGE_ENDPOINT",
  "OBJECT_STORAGE_BUCKET",
  "OBJECT_STORAGE_ACCESS_KEY",
  "OBJECT_STORAGE_SECRET_KEY",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
];
const blockers = [];
const forbidden =
  /(?:<[^>]+>|replace-with|change-before|localhost|127\.0\.0\.1|staging-only|example\.test)/i;

if (process.env.NODE_ENV !== "beta") blockers.push("NODE_ENV must equal beta");
if (process.env.DATABASE_PURPOSE !== "controlled-beta")
  blockers.push("DATABASE_PURPOSE must equal controlled-beta");
if (process.env.STORAGE_PURPOSE !== "controlled-beta")
  blockers.push("STORAGE_PURPOSE must equal controlled-beta");

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value) blockers.push(`${key} is missing`);
  else if (forbidden.test(value))
    blockers.push(`${key} contains a non-beta marker`);
}
for (const key of [
  "BETA_PUBLIC_URL",
  "BETA_ALERT_DESTINATION_URL",
  "OBJECT_STORAGE_ENDPOINT",
]) {
  const value = process.env[key];
  if (value && !value.startsWith("https://"))
    blockers.push(`${key} must use https`);
}
if (process.env.REDIS_URL && !process.env.REDIS_URL.startsWith("rediss://"))
  blockers.push("REDIS_URL must use rediss");
if ((process.env.SESSION_SECRET?.length ?? 0) < 32)
  blockers.push("SESSION_SECRET must contain at least 32 characters");
if ((process.env.OUTBOX_ENCRYPTION_KEY?.length ?? 0) < 32)
  blockers.push("OUTBOX_ENCRYPTION_KEY must contain at least 32 characters");

const evidence = {
  checkedAt: new Date().toISOString(),
  status: blockers.length ? "BLOCKED" : "CONFIGURATION_ACCEPTED",
  identity: {
    environment: process.env.NODE_ENV ?? null,
    databasePurpose: process.env.DATABASE_PURPOSE ?? null,
    storagePurpose: process.env.STORAGE_PURPOSE ?? null,
    releaseVersion: process.env.BETA_RELEASE_VERSION ?? null,
  },
  configuredKeysSha256: createHash("sha256")
    .update(
      required
        .filter((key) => Boolean(process.env[key]))
        .sort()
        .join("\n"),
    )
    .digest("hex"),
  blockers,
  note: "This check validates configuration shape only; it is not domain, TLS, provider, backup, alert or deployment proof.",
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (blockers.length) process.exitCode = 1;
