# ADR 0064: Deterministic controlled-beta test gate

Status: accepted

The controlled-beta verdict is produced by one `pnpm verify:beta` run and one immutable evidence directory. Integration and E2E use separate databases, Redis namespaces, MinIO buckets, artifact roots, cookies and browser contexts. Demo journeys explicitly clear service workers, caches and storage and fail on any API, storage, worker or provider request. Playwright retries and skipped tests are zero. A targeted rerun is diagnostic evidence only and cannot be combined with a failed full run. Reference manifests are captured before and after the gate.
