import type { PrismaClient } from "@weddingos/database";

export async function assertDestructiveDatabasePurpose(
  database: PrismaClient,
  expectedPurpose: "integration" | "e2e" | "restore-target",
) {
  const rows = await database.$queryRaw<
    Array<{
      environment: string;
      databasePurpose: string;
      databaseInstanceId: string;
    }>
  >`SELECT environment,
           database_purpose AS "databasePurpose",
           database_instance_id::text AS "databaseInstanceId"
    FROM database_identities WHERE id = 'singleton'`;
  const identity = rows[0];
  if (!identity || identity.databasePurpose !== expectedPurpose) {
    throw new Error(
      `DESTRUCTIVE_DATABASE_IDENTITY_REFUSED expected=${expectedPurpose} actual=${identity?.databasePurpose ?? "missing"}`,
    );
  }
  return identity;
}
