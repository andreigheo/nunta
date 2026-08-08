import { createRequire } from "node:module";

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = requireFromApi("pg");

export async function readDatabaseIdentity(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT environment, database_purpose AS "databasePurpose", database_instance_id::text AS "databaseInstanceId"
       FROM database_identities WHERE id = 'singleton'`,
    );
    if (result.rowCount !== 1) throw new Error("DATABASE_IDENTITY_MISSING");
    return result.rows[0];
  } finally {
    await client.end();
  }
}

export async function assertDatabaseIdentity(
  databaseUrl,
  expectedPurpose,
  expectedEnvironment,
) {
  const identity = await readDatabaseIdentity(databaseUrl);
  if (identity.databasePurpose !== expectedPurpose) {
    throw new Error(
      `DATABASE_PURPOSE_MISMATCH expected=${expectedPurpose} actual=${identity.databasePurpose}`,
    );
  }
  if (expectedEnvironment && identity.environment !== expectedEnvironment) {
    throw new Error(
      `DATABASE_ENVIRONMENT_MISMATCH expected=${expectedEnvironment} actual=${identity.environment}`,
    );
  }
  return identity;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  const expectedPurpose = process.argv[2];
  const databaseUrl =
    process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!expectedPurpose || !databaseUrl) {
    throw new Error(
      "Usage: DATABASE_OWNER_URL=... node scripts/database-identity.mjs <purpose> [environment]",
    );
  }
  const identity = await assertDatabaseIdentity(
    databaseUrl,
    expectedPurpose,
    process.argv[3],
  );
  process.stdout.write(`${JSON.stringify(identity)}\n`);
}
