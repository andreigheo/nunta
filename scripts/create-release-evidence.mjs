import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root = process.cwd();
const output = resolve(root, "ops/release-evidence/current");
const excluded = [
  ".git/",
  ".next/",
  "node_modules/",
  "ops/artifacts/",
  "ops/imports/",
  "ops/release-evidence/",
  "artifacts/",
  "playwright-report/",
  "test-results/",
  "docs/FINAL_RELEASE_GATE.json",
];

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const name = relative(root, absolute).replaceAll("\\", "/");
    const candidate = `${name}${entry.isDirectory() ? "/" : ""}`;
    if (excluded.some((prefix) => candidate.startsWith(prefix))) continue;
    if (
      candidate.startsWith(".next") ||
      candidate.includes("/.next") ||
      candidate.includes("/node_modules/") ||
      candidate.includes("/dist/")
    )
      continue;
    if (entry.isDirectory()) result.push(...(await files(absolute)));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

const manifest = [];
for (const file of (await files(root)).sort()) {
  const content = await readFile(resolve(root, file));
  manifest.push({
    path: file,
    bytes: (await stat(resolve(root, file))).size,
    sha256: createHash("sha256").update(content).digest("hex"),
  });
}
const manifestBody = `${JSON.stringify({ formatVersion: 1, provenance: "SOURCE_SNAPSHOT_ONLY", excluded, files: manifest }, null, 2)}\n`;
await writeFile(resolve(output, "source-tree-manifest.json"), manifestBody);
const sourceTreeChecksum = createHash("sha256")
  .update(manifestBody)
  .digest("hex");
await writeFile(
  resolve(output, "source-tree-manifest.sha256"),
  `${sourceTreeChecksum}  source-tree-manifest.json\n`,
);

async function checksum(name) {
  try {
    return createHash("sha256")
      .update(await readFile(resolve(output, name)))
      .digest("hex");
  } catch {
    return null;
  }
}
const audit = JSON.parse(
  await readFile(resolve(output, "pnpm-audit.json"), "utf8"),
);
const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
const release = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  environment: "development",
  provenance: {
    status: "SOURCE_SNAPSHOT_ONLY",
    gitCommit: null,
    sourceTreeChecksum,
  },
  artifacts: {
    sbom: await checksum("weddingos.cdx.json"),
    dependencyScan: await checksum("pnpm-audit.json"),
    secretScan: await checksum("gitleaks.json"),
    licenseInventory: await checksum("licenses.json"),
    openApi: await checksum("openapi.json"),
  },
  scanSummary: {
    vulnerabilities,
    secretFindings: JSON.parse(
      await readFile(resolve(output, "gitleaks.json"), "utf8"),
    ).length,
  },
  gates: {
    sourceSnapshotPresent: true,
    sbomPresent: Boolean(await checksum("weddingos.cdx.json")),
    secretScanClean:
      JSON.parse(await readFile(resolve(output, "gitleaks.json"), "utf8"))
        .length === 0,
    highCriticalVulnerabilitiesResolved:
      (vulnerabilities.high ?? 0) === 0 &&
      (vulnerabilities.critical ?? 0) === 0,
    stagingLikeRehearsalPassed: false,
    completeRestorePassed: false,
    externalOffHostBackupConfigured: false,
  },
  verdict: "EVIDENCE_COLLECTED_RELEASE_GATE_NOT_EVALUATED",
  limitations: [
    "SOURCE_SNAPSHOT_ONLY_NO_GIT_COMMIT",
    "SEPARATE_LOCAL_BACKUP_DESTINATION_ONLY",
    "EXTERNAL_PROVIDER_CREDENTIALS_NOT_PROVEN",
  ],
};
await writeFile(
  resolve(output, "release-manifest.json"),
  `${JSON.stringify(release, null, 2)}\n`,
);
await writeFile(
  resolve(output, "release-manifest.sha256"),
  `${await checksum("release-manifest.json")}  release-manifest.json\n`,
);
console.log(
  JSON.stringify({
    sourceTreeChecksum,
    fileCount: manifest.length,
    verdict: release.verdict,
    limitations: release.limitations,
  }),
);
