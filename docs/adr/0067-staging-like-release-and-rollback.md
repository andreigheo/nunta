# ADR 0067: Staging-like release and rollback

Status: accepted

The local staging-like environment is isolated from development and contains TLS proxy, web, API, worker, PostgreSQL, Redis, source/backup/restore object stores, ClamAV, Mailpit, collector, trace backend, Prometheus, Alertmanager and receiver. Deployment consumes a validated release manifest, verifies database identity, takes a fresh backup, applies forward migrations once with the owner role and records smoke/trace/alert evidence. Rollback keeps previous application artifacts and never applies an unreviewed down migration. When schema compatibility is not proven, rollback fails closed and emits a tested roll-forward/maintenance plan. This rehearsal is local staging-like evidence, not external staging or public-production approval.
