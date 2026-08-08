import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpoint = process.env.JAEGER_QUERY_URL ?? "http://127.0.0.1:16686";
const deadline = Date.now() + 60_000;
let proof = null;
let webhookProof = null;
let lastError = null;
while (Date.now() < deadline && (!proof || !webhookProof)) {
  try {
    const response = await fetch(
      `${endpoint}/api/traces?service=weddingos-api-e2e&limit=1000&lookback=1h`,
    );
    if (!response.ok) throw new Error(`Jaeger returned ${response.status}`);
    const body = await response.json();
    for (const trace of body.data ?? []) {
      if (!webhookProof && /webhooks?/i.test(JSON.stringify(trace)))
        webhookProof = trace;
      const serviceNames = new Set(
        Object.values(trace.processes ?? {}).map(
          (process) => process.serviceName,
        ),
      );
      if (
        serviceNames.has("weddingos-api-e2e") &&
        serviceNames.has("weddingos-worker-e2e")
      ) {
        proof = trace;
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
  if (!proof || !webhookProof)
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
}
const serialized = JSON.stringify([proof, webhookProof]);
const forbiddenPatterns = [
  /http\.request\.header\.(?:authorization|cookie)/i,
  /(?:authorization|cookie|password|token)(?:=|%3d|%3D)/i,
  /bearer\s+[a-z0-9._~+/-]+/i,
  /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i,
];
const violations = forbiddenPatterns
  .filter((pattern) => pattern.test(serialized))
  .map((pattern) => pattern.source);
const output = {
  formatVersion: 1,
  verifiedAt: new Date().toISOString(),
  status: proof && webhookProof ? "VERIFIED" : "FAILED",
  privacy:
    proof && webhookProof && violations.length === 0 ? "PASSED" : "FAILED",
  traceId: proof?.traceID ?? null,
  webhookTraceId: webhookProof?.traceID ?? null,
  services: proof
    ? [
        ...new Set(
          Object.values(proof.processes ?? {}).map((item) => item.serviceName),
        ),
      ]
    : [],
  spanCount: proof?.spans?.length ?? 0,
  violations,
  error:
    proof && webhookProof
      ? null
      : (lastError ??
        (!proof
          ? "No distributed API-to-worker trace found"
          : "No webhook trace found")),
};
const directory = resolve(process.cwd(), "ops/release-evidence/current");
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, "trace-verification.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(output)}\n`);
if (output.status !== "VERIFIED" || output.privacy !== "PASSED")
  process.exitCode = 1;
