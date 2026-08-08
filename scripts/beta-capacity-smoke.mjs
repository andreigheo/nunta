import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.BETA_CAPACITY_BASE_URL;
if (!baseUrl) throw new Error("BETA_CAPACITY_BASE_URL is required");
const parsed = new URL(baseUrl);
if (
  !["127.0.0.1", "localhost"].includes(parsed.hostname) &&
  process.env.BETA_CAPACITY_ALLOW_EXTERNAL !== "I_UNDERSTAND_BOUNDED_LOAD"
) {
  throw new Error(
    "External targets require BETA_CAPACITY_ALLOW_EXTERNAL=I_UNDERSTAND_BOUNDED_LOAD",
  );
}

const concurrency = Math.min(
  Number(process.env.BETA_CAPACITY_CONCURRENCY ?? 5),
  10,
);
const requestsPerScenario = Math.min(
  Number(process.env.BETA_CAPACITY_REQUESTS ?? 50),
  200,
);
const workspaceId = process.env.BETA_CAPACITY_WORKSPACE_ID;
const cookie = process.env.BETA_CAPACITY_COOKIE;
const scenarios = [
  ["readiness", "/ready"],
  [
    "dashboard",
    workspaceId ? `/api/v1/workspaces/${workspaceId}/dashboard` : null,
  ],
  [
    "guest-list",
    workspaceId ? `/api/v1/workspaces/${workspaceId}/guests` : null,
  ],
  ["rsvp", workspaceId ? `/api/v1/workspaces/${workspaceId}/rsvp-form` : null],
  [
    "notifications",
    workspaceId ? `/api/v1/workspaces/${workspaceId}/notifications` : null,
  ],
  [
    "check-in",
    workspaceId ? `/api/v1/workspaces/${workspaceId}/check-in/sessions` : null,
  ],
  [
    "search",
    workspaceId ? `/api/v1/workspaces/${workspaceId}/search?q=beta` : null,
  ],
];

const results = [];
for (const [name, path] of scenarios) {
  if (!path || (path.startsWith("/api/") && !cookie)) {
    results.push({
      name,
      status: "NOT_MEASURED",
      reason: !workspaceId
        ? "workspace id missing"
        : "authenticated cookie missing",
    });
    continue;
  }
  const latencies = [];
  let errors = 0;
  let cursor = 0;
  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < requestsPerScenario) {
        cursor += 1;
        const start = performance.now();
        try {
          const response = await fetch(new URL(path, parsed), {
            headers: cookie ? { cookie } : {},
          });
          if (!response.ok) errors += 1;
          await response.arrayBuffer();
        } catch {
          errors += 1;
        }
        latencies.push(performance.now() - start);
      }
    }),
  );
  latencies.sort((a, b) => a - b);
  const percentile = (value) =>
    Number(
      latencies[
        Math.min(latencies.length - 1, Math.ceil(latencies.length * value) - 1)
      ]?.toFixed(2),
    );
  results.push({
    name,
    status: errors ? "DEGRADED" : "MEASURED",
    concurrency,
    requests: latencies.length,
    durationMs: Number((performance.now() - startedAt).toFixed(2)),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    errorRate: Number((errors / latencies.length).toFixed(4)),
  });
}

for (const name of [
  "authentication",
  "sse",
  "uploads",
  "worker-throughput",
  "outbox",
]) {
  results.push({
    name,
    status: "NOT_MEASURED",
    reason:
      "requires a seeded authenticated capacity fixture and mutation-safe runner",
  });
}
const output = {
  generatedAt: new Date().toISOString(),
  target: `${parsed.protocol}//${parsed.host}`,
  bounded: true,
  concurrency,
  requestsPerScenario,
  results,
};
const outputPath = resolve(
  process.env.BETA_CAPACITY_OUTPUT ??
    "artifacts/beta-capacity/local-smoke.json",
);
await mkdir(dirname(outputPath), { recursive: true });
await new Promise((resolveWrite, reject) => {
  const stream = createWriteStream(outputPath, { flags: "w", mode: 0o600 });
  stream.on("error", reject);
  stream.on("finish", resolveWrite);
  stream.end(`${JSON.stringify(output, null, 2)}\n`);
});
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
