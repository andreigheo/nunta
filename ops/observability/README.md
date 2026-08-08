# Local observability proof

All public ports bind to loopback. Prometheus scrapes the token-protected API
metrics endpoint, Alertmanager routes grouped firing and resolved alerts to the
local webhook sink, and the OpenTelemetry Collector redacts sensitive
attributes before forwarding traces to Jaeger.

Production alert receivers and credentials are external configuration and are
not represented as active by this stack.
