# ADR 0060: Local observability runtime stack

Status: accepted

OpenTelemetry Collector plus Jaeger provide local trace ingestion; Prometheus scrapes protected bounded-cardinality metrics; Alertmanager groups and routes alerts to a testable local receiver. Trace context follows HTTP, outbox, BullMQ and worker execution. Bodies, prompts, document text, raw user/tenant identifiers and secrets are forbidden attributes. Production receivers remain configuration, never fabricated credentials.
