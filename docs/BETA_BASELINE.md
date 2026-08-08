# Controlled Beta baseline

## Protected source

- Source snapshot: `/mnt/c/home/andrei/test kimi/weddingos`
- Operational working copy: `/home/andrei/weddingos-beta-operations`
- Provenance: `SOURCE_SNAPSHOT_ONLY`
- Git repository/tag/commit: absent; not invented and not initialized
- Protected Slice 10C report checksum: `docs/FINAL_RELEASE_GATE.json` = `47e9edc6e19983523138779aba67275cb97c36037f66f665f2287fb76cf117c7`
- Protected artifact manifest checksum: `6b653d0abf4230602565b6567cc00b89a9afb75b47a524965b1e2c43f25e4f80`

## Reproduced pre-change gate

The clean operational copy passed `pnpm verify:beta` before Controlled Beta changes:

- run: `2026-07-22T14-11-45-947Z`
- artifact: `artifacts/beta-gate/2026-07-22T14-11-45-947Z`
- E2E: 253 passed, 0 failed, 0 skipped, 0 retries
- unit: 228 passed
- integration: 38 passed
- migrations: 96 applied
- dependency security: 0 critical, 0 high; one moderate transitive advisory remained
- secret scan, backup/restore, two staging-like deployments, rollback and tracing: passed

Two reproducibility defects were corrected only in the working copy: generated final Markdown is formatted before evidence capture, and the beta verifier builds shared packages before typechecking. Staging-like health checks now wait for the proxy and application to be ready instead of treating a transient restart response as final.

## Baseline rule

The original source snapshot and the artifact above are immutable inputs. Controlled Beta evidence is additive and must never be presented as Git, external-domain, provider or public-launch proof.
