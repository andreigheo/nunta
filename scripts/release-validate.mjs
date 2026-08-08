import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const evidenceRoot = resolve(
  root,
  process.env.WEDDINGOS_RELEASE_EVIDENCE_DIR ?? "ops/release-evidence/current",
);

async function json(name) {
  try {
    return JSON.parse(await readFile(resolve(evidenceRoot, name), "utf8"));
  } catch {
    return null;
  }
}

async function fresh(name, maximumAgeHours) {
  try {
    const info = await stat(resolve(evidenceRoot, name));
    return Date.now() - info.mtimeMs <= maximumAgeHours * 3_600_000;
  } catch {
    return false;
  }
}

const audit = await json("pnpm-audit.json");
const beta = await json("beta-gate.json");
const staging = await json("staging-like-deployment.json");
const rollback = await json("staging-like-rollback.json");
const backup = await json("backup-verification.json");
const restore = await json("restore-verification.json");
const trace = await json("trace-verification.json");
const source = await json("source-tree-manifest.json");
const reference = await json("reference-verification.json");
const database = await json("database-verification.json");
const securityGate = await json("security-gate.json");
const vulnerabilities = audit?.metadata?.vulnerabilities ?? {};
const e2e = beta?.tests?.e2e;

const gates = {
  sourceProvenance:
    source?.provenance === "SOURCE_SNAPSHOT_ONLY" &&
    Array.isArray(source?.files) &&
    source.files.length > 0,
  sourceChecksum: await fresh("source-tree-manifest.sha256", 24),
  migrations: beta?.database?.migrationsUpToDate === true,
  databaseState: database?.status === "VERIFIED",
  referenceData: reference?.missing?.length === 0,
  unit: beta?.tests?.unit?.failed === 0,
  integration: beta?.tests?.integration?.failed === 0,
  e2e:
    e2e?.passed >= 253 &&
    e2e?.failed === 0 &&
    e2e?.skipped === 0 &&
    e2e?.retries === 0,
  openApi: beta?.artifacts?.openApi === true,
  openApiArtifact: await fresh("openapi.json", 24),
  builds: beta?.build?.passed === true,
  dependencyScan:
    (vulnerabilities.high ?? Infinity) === 0 &&
    (vulnerabilities.critical ?? Infinity) === 0,
  secretScan: beta?.security?.secretFindings === 0,
  securityGate: securityGate?.status === "PASSED",
  sbom: await fresh("weddingos.cdx.json", 24),
  backupFresh:
    backup?.status === "VERIFIED" &&
    (await fresh("backup-verification.json", 48)),
  restoreFresh:
    restore?.status === "VERIFIED" &&
    (await fresh("restore-verification.json", 168)),
  tracing: trace?.status === "VERIFIED" && trace?.privacy === "PASSED",
  metrics: staging?.checks?.metrics === true,
  dashboards: staging?.checks?.dashboards === true,
  alertRoute: staging?.checks?.alertRoute === true,
  stagingDeployment: staging?.status === "HEALTHY",
  rollbackProof: rollback?.status === "HEALTHY",
  mfa: beta?.security?.mfa === true,
  csrf: beta?.security?.csrf === true,
  ssrf: beta?.security?.socketPinnedSsrf === true,
  retentionDeletion: beta?.privacy?.retentionDeletion === true,
};
const blockers = Object.entries(gates)
  .filter(([, passed]) => !passed)
  .map(
    ([name]) =>
      `GATE_${name.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_MISSING`,
  );
const output = {
  status: blockers.length === 0 ? "READY" : "BLOCKED",
  verdict: blockers.length === 0 ? "READY FOR CONTROLLED BETA" : "BLOCKED",
  blockers,
  evidence: {
    directory: evidenceRoot,
    gates,
    sourceSnapshotChecksum: source
      ? createHash("sha256").update(JSON.stringify(source)).digest("hex")
      : null,
    provenanceLimit: "SOURCE_SNAPSHOT_ONLY_NO_GIT_COMMIT",
    backupDestination:
      backup?.destination ?? "PRODUCTION_CONFIGURATION_REQUIRED",
  },
};
await writeFile(
  resolve(evidenceRoot, "release-gate.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(output)}\n`);
if (output.status !== "READY") process.exitCode = 1;
