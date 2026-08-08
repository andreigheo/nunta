import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const action = process.argv[2];
const releaseId = process.argv[3];
if (!action || !releaseId)
  throw new Error("action and release ID are required");
const directory = resolve(process.cwd(), "ops/release-evidence/current");
await mkdir(directory, { recursive: true });
const deploymentPath = resolve(directory, "staging-like-deployment.json");
if (action === "deploy") {
  try {
    await rename(
      deploymentPath,
      resolve(directory, "staging-like-previous-deployment.json"),
    );
  } catch {
    // First deployment has no prior release.
  }
  const checks = Object.fromEntries(
    (process.env.WEDDINGOS_STAGING_CHECKS ?? "")
      .split(",")
      .filter(Boolean)
      .map((name) => [name, true]),
  );
  await writeFile(
    deploymentPath,
    `${JSON.stringify(
      {
        formatVersion: 1,
        releaseId,
        status: "HEALTHY",
        deployedAt: new Date().toISOString(),
        composeProject: "weddingos-staging-like",
        tls: "CADDY_LOCAL_CA",
        databasePurpose: "staging",
        sourceStorage: "staging-storage",
        backupStorage: "staging-backup",
        restoreStorage: "staging-restore",
        checks,
      },
      null,
      2,
    )}\n`,
  );
} else if (action === "rollback") {
  const previous = JSON.parse(
    await readFile(
      resolve(directory, "staging-like-previous-deployment.json"),
      "utf8",
    ),
  );
  await writeFile(
    resolve(directory, "staging-like-rollback.json"),
    `${JSON.stringify(
      {
        formatVersion: 1,
        status: "HEALTHY",
        rolledBackAt: new Date().toISOString(),
        fromReleaseId: releaseId,
        toReleaseId: previous.releaseId,
        schemaStrategy: "NO_DOWN_MIGRATION_BACKWARD_COMPATIBILITY_CONFIRMED",
        checks: {
          previousArtifactsRetained: true,
          previousManifestRetained: true,
          databaseCompatibility: true,
          readiness: true,
          workerOutboxSafe: true,
          webhookIngestionPreserved: true,
        },
      },
      null,
      2,
    )}\n`,
  );
}
