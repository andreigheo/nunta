# Controlled Beta capacity report

## Status

`PARTIAL LOCAL BASELINE — EXTERNAL CAPACITY BLOCKED`

The bounded runner is `scripts/beta-capacity-smoke.mjs`. It hard-limits concurrency to 10 and requests to 200 per scenario and refuses non-loopback targets unless the operator supplies the explicit external-load acknowledgement. Output is written with mode `0600` under `artifacts/beta-capacity/`.

## Required scenarios

| Scenario          | Local measurement                                                | External measurement |
| ----------------- | ---------------------------------------------------------------- | -------------------- |
| readiness         | measured on a pre-existing loopback API; see below               | blocked              |
| authentication    | not measured; needs seeded mutation-safe fixture                 | blocked              |
| dashboard         | authenticated runner available                                   | blocked              |
| guest list        | authenticated runner available                                   | blocked              |
| RSVP              | authenticated runner available                                   | blocked              |
| notifications     | authenticated runner available                                   | blocked              |
| SSE               | not measured; needs connection-duration fixture                  | blocked              |
| check-in          | authenticated runner available                                   | blocked              |
| uploads           | not measured; needs disposable object fixture and cleanup        | blocked              |
| worker throughput | not measured; needs bounded queued-job fixture                   | blocked              |
| outbox            | not measured; needs bounded mutation fixture and drain assertion | blocked              |
| search            | authenticated runner available                                   | blocked              |

## Loopback readiness sample

At `2026-07-22T15:18:17.091Z`, the bounded runner sent 50 requests to `http://127.0.0.1:4000/ready` with concurrency 5. Results: p50 63.78 ms, p95 136.20 ms, p99 208.17 ms, 0% HTTP/network errors, total duration 795.84 ms. Evidence: `artifacts/beta-capacity/local-readiness.json`.

This was a pre-existing loopback API runtime, not the immutable post-change beta release and not an external environment. CPU, memory and downstream-service utilization were not captured. It proves only that the bounded runner works and establishes a local readiness sample; it does not close any authenticated, mutation, SSE, upload, worker/outbox or external capacity criterion.

The final report must record concurrency, request count, p50/p95/p99, error rate, CPU, memory, database/Redis/object-storage utilization and bottlenecks. Local values cannot close the external capacity criterion.

Recommended ceiling for the first cohort: concurrency 5, 50 requests per read scenario, 10 mutation fixtures per write scenario, one SSE connection per participant type, and immediate stop at 1% error rate, any P0 symptom, queue growth without recovery, or provider throttling.
