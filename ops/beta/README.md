# Controlled Beta external environment

This directory is preparation material, not deployment evidence. No domain, provider, account, or credential is assumed.

Required topology: TLS reverse proxy → web/API; private API → worker, PostgreSQL, Redis, object storage and malware scanner; monitoring/tracing → a routed alert destination; encrypted backups → a separate off-host destination. PostgreSQL, Redis and object storage must be dedicated to `environment=beta`, `databasePurpose=controlled-beta`, and `storagePurpose=controlled-beta`.

Before deployment:

1. Replace every `<...>` marker in `external.env.example` through a secret manager.
2. Create the beta database identity before starting API or worker.
3. Verify the private bucket identity and deny public ACLs.
4. Bind a real configured domain and valid TLS certificate.
5. Run `pnpm verify:beta-environment` inside the release image.
6. Run migrations with the owner identity, then start web, API and worker with least-privilege identities.
7. Prove alert delivery, encrypted off-host backup and isolated restore.
8. Run external smoke and bounded capacity tests; do not reuse local evidence as external evidence.

No Git repository, release tag or external deployment may be created from this directory without explicit authorization.
