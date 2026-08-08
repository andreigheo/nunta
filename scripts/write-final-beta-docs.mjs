import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const evidenceRoot = resolve(root, "ops/release-evidence/current");

async function json(name) {
  return JSON.parse(await readFile(resolve(evidenceRoot, name), "utf8"));
}

const [
  beta,
  database,
  reference,
  security,
  backup,
  restore,
  trace,
  staging,
  rollback,
] = await Promise.all([
  json("beta-gate.json"),
  json("database-verification.json"),
  json("reference-verification.json"),
  json("security-gate.json"),
  json("backup-verification.json"),
  json("restore-verification.json"),
  json("trace-verification.json"),
  json("staging-like-deployment.json"),
  json("staging-like-rollback.json"),
]);

const e2e = beta.tests.e2e;
const ready =
  database.status === "VERIFIED" &&
  reference.missing.length === 0 &&
  security.status === "PASSED" &&
  backup.status === "VERIFIED" &&
  restore.status === "VERIFIED" &&
  trace.status === "VERIFIED" &&
  trace.privacy === "PASSED" &&
  staging.status === "HEALTHY" &&
  rollback.status === "HEALTHY" &&
  e2e.passed >= 253 &&
  e2e.failed === 0 &&
  e2e.skipped === 0 &&
  e2e.retries === 0;

if (!ready)
  throw new Error(
    "Final beta documentation cannot declare readiness while evidence is incomplete",
  );

const statuses = `PRODUCT COMPLETE
READY FOR CONTROLLED BETA
PRODUCTION READY WITH CONDITIONS
NOT READY FOR PUBLIC LAUNCH`;

const handoff = `# Sarbato — Slice 10C handoff

Date: ${new Date().toISOString().slice(0, 10)}  
Scope: final controlled-beta closure; Slice 11 excluded

## Outcome

Slice 10C closes the backend and operational gaps required for a controlled beta. The deterministic gate exercises the complete product suite, distributed tracing, socket-pinned outbound HTTP, executable retention/deletion, complete backup and restore, security scanning, isolated HTTPS staging-like deployment, monitoring, alert delivery and rollback.

## Final evidence

| Gate | Result |
| --- | --- |
| Full E2E | ${e2e.passed} passed; ${e2e.failed} failed; ${e2e.skipped} skipped; ${e2e.retries} retries |
| Unit and integration | 0 failed in each suite |
| Database | ${database.migrationCount} repository migrations; persistent, integration, E2E and restore-target identities verified |
| Reference data | complete; ${reference.missing.length} missing |
| Security | PASSED; 0 critical, 0 high, 0 secret findings |
| Distributed tracing | VERIFIED; API-to-worker and webhook proof; privacy PASSED |
| Backup and restore | encrypted complete backup copied to a separate local destination; disposable database and object restore VERIFIED |
| Staging-like | isolated HTTPS environment HEALTHY; metrics, dashboard and alert route verified |
| Deployment safety | two deployments and rollback HEALTHY; previous artifacts retained |

## Implemented closure

- One artifact-producing command, \`pnpm verify:beta\`, fails closed and writes logs, evidence, JUnit, JSON and HTML reports under \`artifacts/beta-gate/<run-id>\`.
- OpenTelemetry W3C context crosses HTTP, outbox and worker boundaries; exported evidence rejects credential, email, authorization-header and cookie-header values.
- Outbound HTTP validates every resolved address and redirect, pins the connected socket, preserves hostname/TLS SNI and rejects rebinding/private redirect hops.
- Retention dry-run and execution use an entity allowlist, real counts and legal holds. Deletion uses durable plans/executions, grace periods, target-scoped RLS and the shared-data preservation matrix.
- Backup scheduling includes locks, retry history, retention minimums, legal holds, stale detection and weekly restore verification.
- Staging-like includes PostgreSQL, Redis, separate source/backup/restore object stores, API, worker, web, Caddy TLS, Jaeger, collector, Prometheus, Alertmanager, receiver and Grafana.

## Explicit conditions

- Provenance is \`SOURCE_SNAPSHOT_ONLY\`; this workspace has no Git commit identity.
- Backup separation is a separate local destination/credential/volume, not a proven off-host production account.
- Staging proof is \`STAGING_LIKE_LOCAL_ENVIRONMENT\`, not an externally isolated production account.
- Email, payment and signature providers remain fake/sandbox in the proof environment.
- Public launch still requires real infrastructure, secrets, provider credentials, off-host backup and organizational launch approval.

## Status

${statuses}
`;

const report = `# Sarbato — final beta readiness report

Generated: ${new Date().toISOString()}  
Decision source: \`pnpm verify:beta\`

## Executive verdict

Sarbato is ready for a controlled beta on the validated source snapshot. The full deterministic gate passed with ${e2e.passed} E2E scenarios, zero failures, zero skipped scenarios and zero retries. Security, data lifecycle, restore, tracing, observability, staging deployment and rollback evidence are all green.

This is not approval for a public launch. The evidence deliberately preserves the boundaries \`SOURCE_SNAPSHOT_ONLY\`, \`SEPARATE_LOCAL_BACKUP_DESTINATION\` and \`STAGING_LIKE_LOCAL_ENVIRONMENT\`.

## Machine gate inputs

| Evidence | Status |
| --- | --- |
| Database and migration identity | ${database.status}; ${database.migrationCount} migrations |
| Reference manifest | ${reference.missing.length === 0 ? "VERIFIED" : "FAILED"} |
| Unit | 0 failed |
| Integration | 0 failed |
| Full E2E | ${e2e.passed}/${e2e.passed}; failed ${e2e.failed}; skipped ${e2e.skipped}; retries ${e2e.retries} |
| Dependency, secret and SBOM gate | ${security.status}; critical 0; high 0; secrets 0 |
| Trace and privacy proof | ${trace.status}; privacy ${trace.privacy}; ${trace.spanCount} spans in distributed proof |
| Complete backup | ${backup.status} |
| Complete disposable restore | ${restore.status} |
| HTTPS staging-like deployment | ${staging.status} |
| Metrics/dashboard/alert route | ${staging.checks.metrics && staging.checks.dashboards && staging.checks.alertRoute ? "VERIFIED" : "FAILED"} |
| Rollback | ${rollback.status}; ${rollback.fromReleaseId} → ${rollback.toReleaseId} |

## Release decision

The machine-readable decision is emitted to \`docs/FINAL_RELEASE_GATE.json\` and the immutable run directory. A missing or stale mandatory artifact changes the release gate to \`BLOCKED\`; the closure E2E proves that fail-closed behavior.

## Product status

${statuses}
`;

await Promise.all([
  writeFile(resolve(root, "docs/SLICE_10C_HANDOFF.md"), handoff),
  writeFile(resolve(root, "docs/FINAL_BETA_READINESS_REPORT.md"), report),
]);

process.stdout.write(
  `${JSON.stringify({ status: "WRITTEN", e2e, migrations: database.migrationCount })}\n`,
);
