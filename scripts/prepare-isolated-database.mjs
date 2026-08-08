import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = requireFromApi("pg");

const purpose = process.argv[2];
const definitions = {
  integration: { database: "weddingos_integration", environment: "test" },
  e2e: { database: "weddingos_e2e", environment: "test" },
  "restore-target": {
    database: "weddingos_restore_target",
    environment: "test",
  },
  staging: { database: "weddingos_staging", environment: "staging" },
};
const definition = definitions[purpose];
if (!definition)
  throw new Error(`Unknown isolated database purpose: ${purpose ?? "missing"}`);

const adminUrl = new URL(
  process.env.TEST_DATABASE_ADMIN_URL ??
    "postgresql://weddingos:weddingos@127.0.0.1:54339/postgres?schema=public",
);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  const exists = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [definition.database],
  );
  if (!exists.rowCount) {
    await admin.query(
      `CREATE DATABASE "${definition.database}" OWNER weddingos`,
    );
  }
} finally {
  await admin.end();
}

const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${definition.database}`;
targetUrl.searchParams.set("schema", "public");
const migration = spawnSync(
  "corepack",
  ["pnpm", "--filter", "@weddingos/database", "migrate"],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp",
      DATABASE_URL: targetUrl.toString(),
      DATABASE_OWNER_URL: targetUrl.toString(),
    },
    encoding: "utf8",
  },
);
if (migration.status !== 0) {
  process.stderr.write(migration.stdout ?? "");
  process.stderr.write(migration.stderr ?? "");
  throw new Error(`Migration failed for ${definition.database}`);
}

const seed = spawnSync(
  "corepack",
  ["pnpm", "--filter", "@weddingos/database", "seed"],
  {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      TMPDIR: "/tmp",
      TEMP: "/tmp",
      TMP: "/tmp",
      DATABASE_URL: targetUrl.toString(),
      DATABASE_OWNER_URL: targetUrl.toString(),
    },
    encoding: "utf8",
  },
);
if (seed.status !== 0) {
  process.stderr.write(seed.stdout ?? "");
  process.stderr.write(seed.stderr ?? "");
  throw new Error(`Reference bootstrap failed for ${definition.database}`);
}

const target = new Client({ connectionString: targetUrl.toString() });
await target.connect();
try {
  const current = await target.query(
    "SELECT environment, database_purpose FROM database_identities WHERE id = 'singleton'",
  );
  if (current.rowCount !== 1)
    throw new Error("DATABASE_IDENTITY_MISSING_AFTER_MIGRATION");
  const row = current.rows[0];
  const expectedInitial = purpose === "staging" ? "staging" : purpose;
  if (
    row.database_purpose !== expectedInitial &&
    row.database_purpose !== purpose
  ) {
    throw new Error(
      `REFUSING_IDENTITY_REWRITE actual=${row.database_purpose} requested=${purpose}`,
    );
  }
  await target.query(
    `UPDATE database_identities
     SET environment = $1, database_purpose = $2, updated_at = now()
     WHERE id = 'singleton'`,
    [definition.environment, purpose],
  );
  const result = await target.query(
    `SELECT environment, database_purpose AS "databasePurpose", database_instance_id::text AS "databaseInstanceId"
     FROM database_identities WHERE id = 'singleton'`,
  );
  process.stdout.write(
    `${JSON.stringify({ database: definition.database, ...result.rows[0], preparationId: randomUUID() })}\n`,
  );
} finally {
  await target.end();
}
