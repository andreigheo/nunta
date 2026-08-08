import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import database from "../packages/database/dist/index.js";

const { PrismaClient } = database;

const databaseUrl =
  process.env.BETA_DATABASE_OWNER_URL ??
  "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos_e2e?schema=public";
const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
const checks = {};
const missing = [];
try {
  checks.platformRoles = await prisma.platformRole.count();
  checks.legalDocuments = await prisma.legalDocument.count();
  checks.retentionPolicies = await prisma.dataRetentionPolicy.count({
    where: { environment: "test", active: true },
  });
  checks.backupSchedules = await prisma.backupSchedule.count({
    where: { environment: "test", enabled: true },
  });
  if (checks.platformRoles < 7) missing.push("PLATFORM_ROLES");
  if (checks.legalDocuments < 6) missing.push("LEGAL_DOCUMENTS");
  if (checks.retentionPolicies < 10) missing.push("RETENTION_POLICIES");
  if (checks.backupSchedules < 4) missing.push("BACKUP_SCHEDULES");
  const identity = await prisma.databaseIdentity.findUnique({
    where: { id: "singleton" },
  });
  checks.databaseIdentity = identity
    ? {
        environment: identity.environment,
        databasePurpose: identity.databasePurpose,
      }
    : null;
  if (identity?.databasePurpose !== "e2e")
    missing.push("E2E_DATABASE_IDENTITY");
} finally {
  await prisma.$disconnect();
}
const output = {
  formatVersion: 1,
  verifiedAt: new Date().toISOString(),
  checks,
  missing,
};
const directory = resolve(process.cwd(), "ops/release-evidence/current");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "reference-verification.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(output)}\n`);
if (missing.length > 0) process.exitCode = 1;
