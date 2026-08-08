# WeddingOS Slice 10C implementation plan

Date: 2026-07-21  
Scope: final controlled-beta closure only; Slice 11 is excluded

## Verified baseline

- Persistent, integration and E2E databases have distinct persisted identities. The disposable restore database was absent at audit start, was recreated as `restore-target`, and all four databases report 91 migrations with an up-to-date schema.
- The persistent reference manifest is complete: 7 platform roles, 6 published legal versions, 4 consent purposes, 40 retention policies and 40 retention rules.
- Unit baseline is 226/226. Integration baseline is 38/38 on `weddingos_integration` and Redis DB 14.
- API, worker and web user services are enabled and active from `/home/andrei/weddingos-runtime`.
- Integration and E2E have isolated databases and Redis namespaces, but still share the persistent MinIO bucket and artifact root. Slice 10C will assign distinct buckets/roots before the final gate.

## Demo-isolation finding

The three prior full-suite failures were caused by the global maintenance banner issuing `GET /api/v1/status` in Demo Mode. The targeted rerun passed only after that application code was changed, so the two results were from different source states rather than proof of a deterministic full gate. The existing guard checks the demo cookie and the sign-in route; Slice 10C will add explicit per-test browser cleanup and a reusable zero-network assertion, then prove the fix in one full run with no retries.

## Dependency findings

The Slice 10B audit artifact reports 2 critical and 6 high findings:

- `vitest@2.1.9`: critical development-server file read/execution advisory;
- `xlsx@0.18.5`: two high prototype-pollution/ReDoS advisories with no patched npm release;
- `effect@3.18.4`, through Prisma tooling: high AsyncLocalStorage contamination advisory;
- `nodemailer@7.0.13`: high raw-message file-read/SSRF advisory;
- `vite@5.4.21`, through Vitest: high Windows path-deny bypass advisory.

Direct upgrades/removal are preferred. `xlsx` will be replaced rather than excepted. The final security gate must report zero unresolved critical/high findings; dev-only classification does not silently downgrade a finding.

## Tracing and observability gaps

Collector and Jaeger containers exist, but the application has no OpenTelemetry SDK/exporter or real spans. Correlation IDs are not distributed traces. Slice 10C will add a shared telemetry package, API/worker/Next bootstrap, W3C propagation through outbox payloads and BullMQ jobs, safe spans at database/provider/storage/scan/backup boundaries, redaction tests, versioned dashboards and a configurable signed alert receiver contract.

## SSRF gap and design

`SafeOutboundHttpClient` validates DNS and then calls global `fetch`, which resolves the hostname again. It therefore does not prove socket pinning. The replacement will use a dedicated Undici dispatcher with a per-request validated-address connector, correct `Host` and TLS SNI, no inherited proxy, redirect revalidation and a controlled IPv4/IPv6 rebinding fixture.

## Retention and deletion gaps

Policies, rules, legal holds and a minimal retention-execution row exist, but there is no `/platform/retention-runs` API, closed entity-handler registry or worker executor. Deletion currently stops at a request containing JSON impact/plan fields; there are no durable plan/execution records.

Migration `20260721160000_slice_10c_final_beta_closure` will add:

- complete retention run counts, query window, policy version and timestamps;
- durable deletion plans, executions and tombstones;
- backup schedules/run history and release-gate evidence fields;
- constraints, indexes, grants and forced-RLS policies without rewriting history.

Execution will be limited to a code-level entity allowlist. Legal holds and shared-data rules are enforced in workers and covered by the versioned shared-data deletion matrix.

## Backup, staging and release gaps

- Backup/restore scripts prove encrypted local files, but no worker schedule, overlap lock, retention policy or stale alert exists.
- Local Compose has separate source/backup/restore MinIO services, while staging-like lacks restore storage, init jobs, observability services, complete health checks and a rehearsed TLS deployment.
- Release evidence is generated, but `release:validate`, `security:gate`, `staging-like:deploy`, `staging-like:rollback` and `verify:beta` do not exist. The current release verdict is hard-coded blocked rather than calculated from fresh evidence.

Slice 10C will make these gates deterministic and artifact-producing. `SOURCE_SNAPSHOT_ONLY`, `SEPARATE_LOCAL_BACKUP_DESTINATION` and `STAGING_LIKE_LOCAL_ENVIRONMENT` remain explicit limitations; public launch remains blocked.

## Implementation order

1. Isolate all test databases, Redis namespaces, object buckets and artifact roots; add deterministic demo cleanup and zero-network assertions.
2. Remediate critical/high dependencies and add the machine-readable security gate.
3. Add telemetry bootstrap, propagation, redaction, trace proof and dashboards/receiver validation.
4. Replace DNS-precheck-only fetch with socket-pinned outbound HTTP and rebinding tests.
5. Add the forward migration, retention/deletion contracts, closed handlers, APIs, workers, legal-hold/shared-data enforcement and admin wiring.
6. Add backup schedules, separate-destination retention and complete restore evidence.
7. Complete staging-like TLS/deploy/rollback and release validation.
8. Add at least 20 Slice 10C closure scenarios and run one full zero-retry beta gate.
9. Synchronize the validated source to the Linux runtime, migrate, restart-test and write the factual final reports.

## Test matrix

- Unit: telemetry redaction/propagation, pinned connector, redirect/rebinding, retention handlers, deletion matrix, backup locks/retention and release evidence.
- Integration: all four database guards, retention dry-run/execute, deletion execute, legal hold, shared records, backup schedule, alert receiver and release gate.
- E2E: the 20 required closure scenarios plus every existing Slice 1–10B scenario in one run, with 0 skipped and 0 retries.
- Operational: dashboards JSON, Prometheus/Alertmanager/Jaeger, HTTPS staging-like deploy, backup/restore, rollback or factual roll-forward block, and persistent systemd recovery.

The verdict remains `NOT READY FOR BETA` and `NOT READY FOR PUBLIC LAUNCH` until the final gate itself proves otherwise.
