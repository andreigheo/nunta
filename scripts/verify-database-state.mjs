import { createHash } from "node:crypto";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = requireFromApi("pg");
const base = "postgresql://weddingos:weddingos@127.0.0.1:54339";
const targets = [
  ["weddingos", "development", "persistent-runtime"],
  ["weddingos_integration", "test", "integration"],
  ["weddingos_e2e", "test", "e2e"],
  ["weddingos_restore_target", "test", "restore-target"],
];
const migrations = (
  await readdir(resolve(process.cwd(), "packages/database/prisma/migrations"), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const databases = [];
const failures = [];
for (const [database, environment, purpose] of targets) {
  const client = new Client({
    connectionString: `${base}/${database}?schema=public`,
  });
  try {
    await client.connect();
    const identity = await client.query(
      "SELECT environment, database_purpose FROM database_identities WHERE id='singleton'",
    );
    const applied = await client.query(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name",
    );
    const row = identity.rows[0];
    const appliedNames = applied.rows.map((item) => item.migration_name);
    const missingMigrations = migrations.filter(
      (migration) => !appliedNames.includes(migration),
    );
    if (row?.environment !== environment || row?.database_purpose !== purpose)
      failures.push(`${database}:IDENTITY_MISMATCH`);
    if (missingMigrations.length > 0)
      failures.push(`${database}:MIGRATIONS_MISSING`);
    databases.push({
      database,
      environment: row?.environment ?? null,
      databasePurpose: row?.database_purpose ?? null,
      appliedMigrations: appliedNames.length,
      missingMigrations,
    });
  } catch (error) {
    failures.push(
      `${database}:${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
const output = {
  formatVersion: 1,
  verifiedAt: new Date().toISOString(),
  status: failures.length === 0 ? "VERIFIED" : "FAILED",
  migrationCount: migrations.length,
  migrationManifestSha256: createHash("sha256")
    .update(`${migrations.join("\n")}\n`)
    .digest("hex"),
  migrations,
  databases,
  failures,
};
const directory = resolve(process.cwd(), "ops/release-evidence/current");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "database-verification.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(output)}\n`);
if (failures.length > 0) process.exitCode = 1;
