# ADR 0063: Release provenance and beta gate

Status: accepted

Release evidence binds source provenance, tree/build/OpenAPI/migration/reference/SBOM checksums, test and scan results, backup/restore freshness and environment identity. Approval fails closed when required evidence is absent or stale. This checkout has no factual Git repository, so provenance is `SOURCE_SNAPSHOT_ONLY`; no commit is invented and public launch remains blocked. Controlled beta additionally requires the isolated staging-like rehearsal and every local security/operations gate to pass.
