# Service level objectives

These are beta targets, not measured production claims.

| Signal            | Target                                            | Window          | Alert                                           |
| ----------------- | ------------------------------------------------- | --------------- | ----------------------------------------------- |
| API availability  | 99.5% successful non-5xx requests                 | rolling 30 days | burn-rate alert after production traffic exists |
| API latency       | 95% under 750 ms for interactive endpoints        | rolling 7 days  | sustained breach for 15 minutes                 |
| Worker freshness  | heartbeat age under 45 seconds                    | continuous      | critical when stale                             |
| Outbox delivery   | 99% internal executions complete within 5 minutes | rolling 7 days  | queue age/backlog threshold                     |
| Restore readiness | successful DB + object restore rehearsal          | every 30 days   | missed/failed rehearsal                         |
| Backup freshness  | successful verified backup under 24 hours old     | continuous      | critical after 24 hours                         |

Health, worker and database alert rules exist locally. End-to-end application tracing, complete SLO dashboards, production traffic-based burn rates and external paging are not yet implemented; therefore the SLOs are not currently enforceable production guarantees.
