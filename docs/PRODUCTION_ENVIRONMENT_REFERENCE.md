# Production environment reference

## Environment identities

| Runtime              | `NODE_ENV`    | `DATABASE_PURPOSE`   | Database                                              |
| -------------------- | ------------- | -------------------- | ----------------------------------------------------- |
| Persistent local     | `development` | `persistent-runtime` | `weddingos`                                           |
| Integration          | `test`        | `integration`        | `weddingos_integration`                               |
| E2E                  | `test`        | `e2e`                | `weddingos_e2e`                                       |
| Restore verification | `test`        | `restore-target`     | explicit `weddingos_restore_*` target                 |
| Staging-like         | `production`  | `staging`            | isolated Compose database                             |
| Production           | `production`  | `production`         | externally managed, not configured in this repository |

Every database contains the singleton `database_identities` record. API, worker, destructive test preparation and restore tooling fail closed when the expected purpose does not match.

## Local persistent runtime

- Source: `/mnt/c/home/andrei/test kimi/weddingos`
- Runtime copy: `/home/andrei/weddingos-runtime`
- Web: `http://127.0.0.1:43191`
- API: `http://127.0.0.1:4000`
- PostgreSQL: loopback `54339`
- Redis: loopback `56379`
- Object store: loopback `59000`
- Supervisor: enabled user units `weddingos-api`, `weddingos-worker`, `weddingos-web`

The local values in the service units are development-only. They must never be promoted as production credentials.

## Required production configuration

Production needs independently provisioned PostgreSQL, Redis, private object storage, backup storage under separate credentials and failure domain, SMTP, payment/signature/subscription/payout providers, TLS termination, DNS, OTLP collector, Prometheus-compatible metrics collection and an external Alertmanager receiver. Secrets must come from the deployment secret manager, not the repository or systemd source templates.

The metrics endpoint is `/api/v1/internal/metrics` and requires a bearer token. Health endpoints are `/health` and `/ready`; readiness is not green unless database identity, reference data, Redis and worker heartbeat are verified.

## Current production status

No external staging or production environment, domain, TLS certificate, provider credentials, off-host backup destination or external alert receiver was supplied. The Compose staging-like definition is a local rehearsal specification only.
