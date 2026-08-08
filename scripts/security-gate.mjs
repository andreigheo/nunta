import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "ops/release-evidence/current");
await mkdir(output, { recursive: true });
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("pnpm execution path is unavailable");

async function capture(args, allowAuditExit = false) {
  return new Promise((resolveCapture, reject) => {
    const child = spawn(process.execPath, [pnpm, ...args], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0 && !allowAuditExit)
        reject(new Error(Buffer.concat(stderr).toString("utf8")));
      else resolveCapture(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

async function checksum(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

const auditBody = await capture(["audit", "--json"], true);
const audit = JSON.parse(auditBody);
await writeFile(
  resolve(output, "pnpm-audit.json"),
  `${JSON.stringify(audit, null, 2)}\n`,
);

const inventory = JSON.parse(
  await capture(["list", "--json", "--depth", "Infinity"]),
);
const components = new Map();
function collect(node) {
  for (const dependencyGroup of [node.dependencies, node.devDependencies]) {
    for (const [name, dependency] of Object.entries(dependencyGroup ?? {})) {
      const version = dependency.version ?? "unknown";
      components.set(`${name}@${version}`, {
        type: "library",
        name,
        version,
        purl: `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      });
      collect(dependency);
    }
  }
}
for (const project of inventory) collect(project);
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: "application", name: "Sarbato", version: "10c" },
  },
  components: [...components.values()].sort((a, b) =>
    a.purl.localeCompare(b.purl),
  ),
};
await writeFile(
  resolve(output, "weddingos.cdx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`,
);

const licenses = await capture(["licenses", "list", "--json"]);
await writeFile(resolve(output, "licenses.json"), licenses);

await writeFile(
  resolve(output, "weddingos.cdx.sha256"),
  `${await checksum(resolve(output, "weddingos.cdx.json"))}  ops/release-evidence/current/weddingos.cdx.json\n`,
);
await writeFile(
  resolve(output, "supply-chain.sha256"),
  [
    `${await checksum(resolve(root, "pnpm-lock.yaml"))}  pnpm-lock.yaml`,
    `${await checksum(resolve(output, "pnpm-audit.json"))}  ops/release-evidence/current/pnpm-audit.json`,
    `${await checksum(resolve(output, "licenses.json"))}  ops/release-evidence/current/licenses.json`,
    "",
  ].join("\n"),
);

const excluded = [
  "node_modules",
  ".next",
  ".git",
  "ops/release-evidence",
  "test-results",
  "playwright-report",
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /gh[pousr]_[A-Za-z0-9]{36,255}/,
  /sk-(?:live|proj)-[A-Za-z0-9_-]{20,}/,
];
const findings = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const name = relative(root, absolute).replaceAll("\\", "/");
    if (
      excluded.some(
        (prefix) => name === prefix || name.startsWith(`${prefix}/`),
      )
    )
      continue;
    if (entry.isDirectory()) await scan(absolute);
    else if (entry.isFile()) {
      let body;
      try {
        body = await readFile(absolute, "utf8");
      } catch {
        continue;
      }
      for (const pattern of secretPatterns) {
        if (pattern.test(body)) {
          findings.push({
            file: name,
            rule: pattern.source,
            fingerprint: createHash("sha256").update(name).digest("hex"),
          });
        }
      }
    }
  }
}
await scan(root);
await writeFile(
  resolve(output, "gitleaks.json"),
  `${JSON.stringify(findings, null, 2)}\n`,
);

const vulnerabilities = audit.metadata?.vulnerabilities ?? {};
const gate = {
  status:
    (vulnerabilities.high ?? 0) === 0 &&
    (vulnerabilities.critical ?? 0) === 0 &&
    findings.length === 0
      ? "PASSED"
      : "BLOCKED",
  vulnerabilities,
  secretFindings: findings.length,
  sbomComponents: components.size,
  artifacts: [
    "pnpm-audit.json",
    "gitleaks.json",
    "licenses.json",
    "weddingos.cdx.json",
    "weddingos.cdx.sha256",
    "supply-chain.sha256",
  ],
};
await writeFile(
  resolve(output, "security-gate.json"),
  `${JSON.stringify(gate, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(gate)}\n`);
if (gate.status !== "PASSED") process.exitCode = 1;
