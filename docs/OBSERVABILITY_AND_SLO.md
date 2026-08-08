# Observability, SLO and alert contract

Structured application logs carry request/correlation IDs, operation, status and duration; they must not contain passwords, tokens, document contents, sensitive guest data or raw provider payloads. The protected Prometheus endpoint is `/api/v1/internal/metrics` and uses a bearer secret on the private network. Metric labels are bounded and contain no user, workspace, email, token or document identifiers.

Initial controlled-beta objectives, measured over 30 days:

- authenticated API availability: 99.5%; latency p95 below 750 ms;
- outbox oldest pending age below 120 seconds and worker heartbeat below 45 seconds;
- provider webhook acknowledgement p95 below 2 seconds when the durable intent store is healthy;
- verified daily backup and a successful disposable restore no older than 30 days.

Alert on sustained API error rate, stale worker, outbox backlog, dead letters, repeated invalid webhook signatures, failed backup/restore, expiring kill switch, pending migration and release gate failure. Alert dedupe keys must combine signal, environment and bounded time window. No external alert receiver is configured in this repository, so alert delivery remains a production gate.
