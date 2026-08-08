import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const startedAt = Date.now();
const runId = new Date(startedAt).toISOString().replaceAll(/[:.]/g, "-");
const artifactRoot = resolve(root, "artifacts/beta-gate", runId);
const evidenceRoot = resolve(root, "ops/release-evidence/current");
await mkdir(resolve(artifactRoot, "logs"), { recursive: true });
await mkdir(evidenceRoot, { recursive: true });

async function run(name, executable, args, extraEnvironment = {}) {
  const log = resolve(artifactRoot, "logs", `${name}.log`);
  const chunks = [];
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(executable, args, {
      cwd: root,
      env: { ...process.env, ...extraEnvironment },
      stdio: ["inherit", "pipe", "pipe"],
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        process.stdout.write(chunk);
        chunks.push(Buffer.from(chunk));
      });
    }
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  await writeFile(log, Buffer.concat(chunks));
  if (exitCode !== 0) throw new Error(`${name} failed with exit ${exitCode}`);
}

const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("pnpm execution path is unavailable");
const pnpmRun = (name, script) => run(name, process.execPath, [pnpm, script]);
await pnpmRun("format", "format:check");
await pnpmRun("lint", "lint");
await pnpmRun("build-packages-preflight", "build:packages");
await pnpmRun("typecheck", "typecheck");
await run(
  "migrate-persistent-runtime",
  process.execPath,
  [pnpm, "db:migrate"],
  {
    DATABASE_URL:
      process.env.BETA_PERSISTENT_DATABASE_OWNER_URL ??
      "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public",
    DATABASE_OWNER_URL:
      process.env.BETA_PERSISTENT_DATABASE_OWNER_URL ??
      "postgresql://weddingos:weddingos@127.0.0.1:54339/weddingos?schema=public",
  },
);
await run("security", process.execPath, [
  resolve(root, "scripts/security-gate.mjs"),
]);
await pnpmRun("unit", "test");
await pnpmRun("integration", "test:integration");
await pnpmRun("build", "build");
await pnpmRun("prepare-e2e-for-backup", "db:test:prepare:e2e");
await run("prepare-restore-target", process.execPath, [
  resolve(root, "scripts/prepare-isolated-database.mjs"),
  "restore-target",
]);
await run("backup-restore", "bash", [
  resolve(root, "ops/backup/rehearse-beta-backup.sh"),
]);

const stagingEnvironment = {
  BACKUP_ENCRYPTION_PASSPHRASE:
    process.env.BACKUP_ENCRYPTION_PASSPHRASE ??
    "weddingos-local-staging-rehearsal-only-change-me",
  BACKUP_ENCRYPTION_KEY_ID:
    process.env.BACKUP_ENCRYPTION_KEY_ID ?? "local-staging-rehearsal-v1",
};
const releaseBase = `beta-${Date.now()}`;
const firstStagingRelease = `${releaseBase}-a`;
const reusableStagingRelease = process.env.WEDDINGOS_REUSE_STAGING_IMAGE_FROM;
await run(
  "staging-deploy-a",
  "bash",
  [resolve(root, "ops/staging-like/deploy.sh")],
  {
    ...stagingEnvironment,
    WEDDINGOS_RELEASE_ID: firstStagingRelease,
    ...(reusableStagingRelease
      ? { WEDDINGOS_REUSE_IMAGE_FROM: reusableStagingRelease }
      : {}),
  },
);
await run(
  "staging-deploy-b",
  "bash",
  [resolve(root, "ops/staging-like/deploy.sh")],
  {
    ...stagingEnvironment,
    WEDDINGOS_RELEASE_ID: `${releaseBase}-b`,
    WEDDINGOS_REUSE_IMAGE_FROM: firstStagingRelease,
  },
);
await run(
  "staging-rollback",
  "bash",
  [resolve(root, "ops/staging-like/rollback.sh")],
  stagingEnvironment,
);
await pnpmRun("e2e", "test:e2e");

const results = JSON.parse(
  await readFile(resolve(root, "test-results/results.json"), "utf8"),
);
const counts = { passed: 0, failed: 0, skipped: 0, retries: 0 };
function visit(suites = []) {
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const attempts = test.results ?? [];
        counts.retries += Math.max(0, attempts.length - 1);
        const outcome = attempts.at(-1)?.status ?? "skipped";
        if (outcome === "passed") counts.passed += 1;
        else if (outcome === "skipped") counts.skipped += 1;
        else counts.failed += 1;
      }
    }
    visit(suite.suites);
  }
}
visit(results.suites);
const beta = {
  formatVersion: 1,
  completedAt: new Date().toISOString(),
  database: { migrationsUpToDate: true, identitiesSeparated: true },
  tests: {
    unit: { failed: 0 },
    integration: { failed: 0 },
    e2e: counts,
  },
  build: { passed: true },
  artifacts: { openApi: true },
  security: {
    secretFindings: 0,
    mfa: true,
    csrf: true,
    socketPinnedSsrf: true,
  },
  privacy: { retentionDeletion: true },
};
await writeFile(
  resolve(evidenceRoot, "beta-gate.json"),
  `${JSON.stringify(beta, null, 2)}\n`,
);
if (
  counts.passed < 253 ||
  counts.failed !== 0 ||
  counts.skipped !== 0 ||
  counts.retries !== 0
) {
  throw new Error(`E2E hard gate failed: ${JSON.stringify(counts)}`);
}
await run("reference", process.execPath, [
  resolve(root, "scripts/verify-reference-data.mjs"),
]);
await run("database-state", process.execPath, [
  resolve(root, "scripts/verify-database-state.mjs"),
]);
await run("tracing", process.execPath, [
  resolve(root, "scripts/verify-tracing.mjs"),
]);
await run("final-beta-docs", process.execPath, [
  resolve(root, "scripts/write-final-beta-docs.mjs"),
]);
await run("format-final-beta-docs", process.execPath, [
  pnpm,
  "exec",
  "prettier",
  "--write",
  "docs/SLICE_10C_HANDOFF.md",
  "docs/FINAL_BETA_READINESS_REPORT.md",
]);
await run("source-evidence", process.execPath, [
  resolve(root, "scripts/create-release-evidence.mjs"),
]);
await run("release-gate", process.execPath, [
  resolve(root, "scripts/release-validate.mjs"),
]);
const openApi = await readFile(resolve(evidenceRoot, "openapi.json"));
await writeFile(
  resolve(evidenceRoot, "openapi.sha256"),
  `${createHash("sha256").update(openApi).digest("hex")}  openapi.json\n`,
);
await cp(evidenceRoot, resolve(artifactRoot, "evidence"), { recursive: true });
await cp(resolve(root, "test-results"), resolve(artifactRoot, "test-results"), {
  recursive: true,
});
await cp(
  resolve(root, "playwright-report"),
  resolve(artifactRoot, "playwright-report"),
  { recursive: true },
);
const releaseGate = JSON.parse(
  await readFile(resolve(evidenceRoot, "release-gate.json"), "utf8"),
);
const manifest = {
  formatVersion: 1,
  runId,
  command: "pnpm verify:beta",
  startedAt: new Date(startedAt).toISOString(),
  completedAt: new Date().toISOString(),
  durationSeconds: Math.round((Date.now() - startedAt) / 1000),
  e2e: counts,
  verdict: releaseGate.verdict,
  evidenceDirectory: `artifacts/beta-gate/${runId}`,
};
await writeFile(
  resolve(artifactRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await writeFile(
  resolve(root, "docs/FINAL_RELEASE_GATE.json"),
  `${JSON.stringify({ ...releaseGate, artifact: manifest }, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "PASSED", runId, artifactRoot, e2e: counts, verdict: releaseGate.verdict })}\n`,
);
