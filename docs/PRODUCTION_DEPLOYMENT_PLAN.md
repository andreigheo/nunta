# WeddingOS production deployment plan

## Chosen initial topology

The existing implementation supports a provider-neutral single-host controlled-beta topology: Caddy terminates TLS; Next.js listens on loopback `43191`; Nest API listens on loopback `4000`; the worker has no public listener; PostgreSQL, Redis, MinIO, Mailpit/provider SMTP and ClamAV stay on private networks. The Caddy template is in `ops/caddy/Caddyfile.template`.

This is not a public-production approval. A managed PostgreSQL/object-storage topology is preferred before public launch; horizontal API/worker scaling can follow after shared Redis, storage and observability sinks are configured.

## Environments and secrets

Development, test, staging and production use separate databases, Redis instances, buckets, cookie domains, outbox encryption keys and provider credentials. Production startup requires HTTPS and authenticated TLS Redis. Migrations use `DATABASE_OWNER_URL` only in a deployment job; API and worker use their restricted roles. Secrets come from the deployment secret store and are never exposed by the admin UI or release manifest.

## Release procedure

1. Build from a Git-provenanced immutable revision with locked Node 22 and pnpm 9.
2. Pass formatting, lint, typecheck, unit, integration, E2E, OpenAPI, migration, dependency/secret scan, SBOM and build gates.
3. Verify a recent encrypted backup and disposable restore. Generate checksums and release manifest.
4. Put mutations into a short maintenance window, drain workers, apply forward-compatible migrations, deploy API/worker/web, then resume workers.
5. Run `/health`, `/ready`, internal metrics, authentication and representative workspace/provider smoke tests. Webhooks must retain raw-body signature verification and event dedupe.
6. Promote only after two-person approval for production. Roll back application artifacts if checks fail; database rollback uses an explicit forward repair or validated restore, never an unreviewed down migration.

## Required external gates

- staging domain and TLS proof;
- off-host encrypted DB and object backups plus scheduled restore verification;
- external logs, traces, metrics and alert receiver;
- Git commit provenance and signed/checksummed release artifacts;
- sandbox/production provider credentials and webhook registrations;
- privacy/terms/cookie legal review;
- capacity, vulnerability and incident-response sign-off.
