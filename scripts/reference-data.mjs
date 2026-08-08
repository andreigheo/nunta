import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire as nodeCreateRequire } from "node:module";

const requireFromApi = nodeCreateRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = requireFromApi("pg");
const command = process.argv[2] ?? "verify";
const databaseUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_OWNER_URL is required");

const required = {
  platform_roles: [
    "PLATFORM_SUPER_ADMIN",
    "PLATFORM_OPERATIONS",
    "PLATFORM_SUPPORT",
    "PLATFORM_TRUST_SAFETY",
    "PLATFORM_FINANCE",
    "PLATFORM_SECURITY",
    "PLATFORM_READ_ONLY",
  ],
  legal_documents: [
    "terms",
    "privacy-policy",
    "cookie-policy",
    "ai-data-policy",
    "vendor-terms",
    "payment-terms",
  ],
  consent_purposes: [
    "essential-service",
    "product-analytics",
    "marketing",
    "ai-assistance",
  ],
  platform_feature_flags: ["system.maintenance_mode"],
};

async function capture(client) {
  const rows = {};
  for (const [table, keys] of Object.entries(required)) {
    const column = table === "platform_roles" ? "key" : "key";
    const result = await client.query(
      `SELECT ${column} AS key FROM ${table} WHERE ${column} = ANY($1::text[]) ORDER BY ${column}`,
      [keys],
    );
    rows[table] = [...new Set(result.rows.map((row) => row.key))];
  }
  const counts = await client.query(
    `SELECT
      (SELECT count(*)::int FROM legal_document_versions WHERE status = 'PUBLISHED') AS "publishedLegalVersions",
      (SELECT count(*)::int FROM data_retention_policies) AS "retentionPolicies",
      (SELECT count(*)::int FROM data_retention_rules) AS "retentionRules"`,
  );
  const manifest = { version: 1, required: rows, counts: counts.rows[0] };
  return {
    ...manifest,
    checksumSha256: createHash("sha256")
      .update(JSON.stringify(manifest))
      .digest("hex"),
  };
}

function missingFrom(manifest) {
  const missing = [];
  for (const [table, keys] of Object.entries(required)) {
    for (const key of keys)
      if (!manifest.required[table].includes(key))
        missing.push(`${table}:${key}`);
  }
  if (manifest.counts.publishedLegalVersions < 6)
    missing.push("legal_document_versions:published<6");
  if (manifest.counts.retentionPolicies < 40)
    missing.push("data_retention_policies:<40");
  if (manifest.counts.retentionRules < 40)
    missing.push("data_retention_rules:<40");
  return missing;
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  if (command === "repair") {
    if (process.env.NODE_ENV === "production")
      throw new Error("REFERENCE_REPAIR_DISABLED_IN_PRODUCTION");
    const before = await capture(client);
    const missing = missingFrom(before);
    if (missing.length) {
      const migration = await readFile(
        new URL(
          "../packages/database/prisma/migrations/20260721120000_slice_10b_beta_closure/migration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const start = migration.indexOf('INSERT INTO "platform_roles"');
      const end = migration.indexOf("REVOKE DELETE", start);
      if (start < 0 || end < 0)
        throw new Error("REFERENCE_BOOTSTRAP_SOURCE_MISSING");
      for (const statement of migration.slice(start, end).split(/;\s*\n/)) {
        if (statement.trim()) await client.query(statement);
      }
      const actorUserId = process.env.REFERENCE_REPAIR_ACTOR_ID;
      if (actorUserId) {
        await client.query(
          `INSERT INTO platform_admin_actions
           (actor_user_id, capability, action, target_type, environment, reason, outcome)
           VALUES ($1::uuid, 'platform.audit.read', 'reference.repair', 'REFERENCE_DATA', 'development', $2, 'SUCCESS')`,
          [
            actorUserId,
            `Repaired only missing reference records: ${missing.join(", ")}`,
          ],
        );
      }
    }
  }
  const manifest = await capture(client);
  const missing = missingFrom(manifest);
  process.stdout.write(
    `${JSON.stringify({ ...manifest, missing }, null, 2)}\n`,
  );
  if (missing.length) process.exitCode = 2;
} finally {
  await client.end();
}
