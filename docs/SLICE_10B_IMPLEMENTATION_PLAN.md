# WeddingOS Slice 10B implementation plan

Date: 2026-07-21  
Scope: beta closure only; no Slice 11 product domain

## Demonstrated reference-data incident

The probable cause was a test process using the persistent runtime database. The source audit demonstrated the exact path:

1. `pnpm verify` runs `apps/api` integration tests.
2. `apps/api/package.json` hard-codes both integration API and worker to database `weddingos` on port `54339`.
3. `apps/api/test/setup.ts` falls back to the same persistent database.
4. Five integration suites query all public tables and execute `TRUNCATE ... RESTART IDENTITY CASCADE`, excluding only older reference tables.
5. Slice 10 tables such as `platform_roles`, `legal_documents` and `data_retention_policies` are therefore truncated from the persistent database.

The final fix is an isolated `weddingos_integration` database plus a persisted database-identity guard checked before every destructive fixture. Manual reseeding is not accepted as the fix.

## Files and surfaces

- database schema and one forward migration for identity, MFA/step-up, reference catalog and release evidence;
- test database bootstrap/identity/reference scripts;
- integration and Playwright configuration;
- auth middleware/controllers/services for MFA, step-up and CSRF;
- common outbound HTTP and maintenance controls;
- platform/privacy/retention/security/release services;
- worker consumers and backup/restore scripts;
- Docker Compose observability, backup destination and staging-like overlays;
- separate `/admin/*` pages using the existing portal design;
- OpenAPI, registries, CI, runbooks and final handoff reports.

## Proposed migration

`20260721120000_slice_10b_beta_closure`:

- `database_identities` singleton identity contract;
- `mfa_authenticators`, `mfa_recovery_codes`, `mfa_challenges`, `admin_step_up_sessions`;
- `consent_purposes`, `data_retention_rules`;
- `release_artifacts`, `release_deployments`;
- stable reference data and reference-table mutation grants;
- indexes, expiry constraints and append-only protections.

No historical migration is rewritten.

## Security strategy

- TOTP: encrypted secret, confirmation before activation, bounded clock tolerance, replay counter, one-time hash-only recovery codes.
- Step-up: password plus TOTP/recovery verification, bound to user, session and purpose for ten minutes.
- CSRF: session-bound signed token returned by `GET /api/v1/auth/csrf`; required in `X-CSRF-Token` for cookie-authenticated unsafe methods; signed webhooks and opaque guest flows remain separate.
- SSRF: one `SafeOutboundHttpClient`, address classification after A/AAAA resolution, redirect revalidation, allowlists, timeout/size/content-type bounds and proxy isolation.

## Runtime and operations strategy

- maintenance middleware evaluates active windows and blocks scoped traffic with Problem Details;
- security events aggregate by threshold/window/dedupe rather than one alert per event;
- OpenTelemetry exports to a loopback collector/Jaeger stack;
- Prometheus scrapes protected metrics and Alertmanager delivers to a local receiver;
- privacy export creates an expiring requester-bound artifact;
- retention/deletion execute only allowlisted plans with legal-hold/shared-data checks;
- database plus objects are encrypted into a separate backup destination and restored only to identity-guarded disposable targets.

## Supply chain and release

- run dependency, secret and license scans and preserve outputs;
- generate and validate CycloneDX SBOM plus checksums;
- when Git is absent, emit deterministic `SOURCE_SNAPSHOT_ONLY` provenance—never a fabricated commit;
- release manifest binds source, migrations, references, OpenAPI, tests, scans, SBOM and restore evidence;
- staging-like Compose uses separate DB, Redis, storage, backup destination and credentials.

## Test order

1. Baseline `pnpm verify`, 233 E2E, migrations and service health.
2. Reproduce the persistent-database truncation and capture reference manifest.
3. Identity/reference guards and isolated integration database.
4. MFA, recovery, step-up, CSRF, SSRF and maintenance unit/integration tests.
5. Security detection, observability and local alert delivery.
6. Privacy, retention, deletion and legal-hold flows.
7. Complete backup/restore, scans, SBOM and release gate.
8. At least 20 Slice 10B E2E, then full zero-skip/retry gate.
9. Build, staging-like rehearsal where infrastructure permits, persistent runtime restart and final factual verdict.

## External limits

The checkout has no factual Git repository. Production domain, provider credentials, independent external monitoring, real off-host backup, legal approval and independent security review are not present. They remain public-launch blockers even if the local beta gate passes.
