# ADR 0006: Background jobs and worker

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2A worker, Redis/BullMQ, retries, RLS, and operations

## Context

WeddingOS needs durable email delivery, notification/activity projections, and asynchronous activity export. Redis cannot be the durable execution ledger, a worker using the database owner would bypass tenant isolation, and exposing every internal projection as a browser job would leak infrastructure into the product contract.

## Decision

`apps/worker` is a separately supervised process and `@weddingos/jobs` is the shared closed protocol. The only queue is `weddingos-domain-events`; the only executable contract is `domain-event.consumer.v1`. Its payload contains only `outboxMessageId`, `consumerExecutionId`, and `consumerName`. The processor resolves an allowlisted consumer, never an arbitrary module/function or queue-supplied tenant context.

`OutboxConsumerExecution` is the durable internal source of truth for each independently retryable consumer. `BackgroundJob` exists only when progress is intentionally user-visible, currently onboarding completion and activity export. It summarizes the linked consumer set but does not replace it. Internal email, notification, activity, and acknowledgement consumers do not create browser-visible jobs.

BullMQ IDs are `<outboxMessageId>--<consumerName>`. The dispatcher reuses active/waiting deterministic jobs and, when PostgreSQL says work is still nonterminal but the matching BullMQ job is terminal, removes that transport record and recreates it with the same deterministic ID. This closes the Redis-completed/PostgreSQL-unacknowledged recovery case without replaying completed sibling consumers.

The worker connects only as `weddingos_worker` (`LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`). A security-definer begin function joins the requested execution to its outbox and optional visible job and returns the persisted workspace, actor, correlation, and contract. Only this returned snapshot is used to set transaction-local execution/job/workspace/user context. Forced RLS policies bind execution, outbox, delivery, projection, and artifact rows to that persisted context. A forged workspace value in Redis cannot alter the tenant context.

Execution transitions, attempts, availability, stale locks, heartbeat, redacted errors, and completion live in PostgreSQL. The dispatcher and worker use short claims plus reconciliation; partial success leaves completed consumers untouched while failed siblings retry or dead-letter. A restricted reconciliation function aggregates consumer state into the outbox and optional visible job.

Delivery is at-least-once. Unique database dedupe keys make supported projection effects effectively once. SMTP can accept a message before PostgreSQL acknowledgement; after a crash the worker may resend. Deterministic IDs and provider message IDs reduce this window but do not provide universal exactly-once delivery.

A PostgreSQL heartbeat records worker liveness. `/ready` reports database failure as unavailable and Redis/worker degradation as buffering because the transactional outbox still accepts durable intent. The worker handles `SIGTERM`/`SIGINT`, stops new claims, closes BullMQ/Redis/database clients, and is supervised by an enabled loopback-local systemd user service with `Restart=always` and a stable workspace path.

## Consequences

- Redis loss delays work but cannot erase a committed delivery intent.
- One outbox event can have multiple independently retryable consumers without exposing internal jobs to users.
- A new consumer or event requires an explicit shared contract and code registration.
- Runtime worker credentials cannot migrate the schema or bypass RLS.
- Tests must cover dispatcher/worker crashes, partial consumer success, forged workspace data, terminal BullMQ recovery, and provider success before internal acknowledgement.
- Plan generation remains outside Slice 2A.
