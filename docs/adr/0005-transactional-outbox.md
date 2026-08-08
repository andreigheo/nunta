# ADR 0005: Transactional outbox

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2A durable side effects and semantic events

## Context

Slice 1 persists the authoritative mutation and invokes SMTP afterwards. A process crash or provider failure can therefore commit the user, token, invitation, or password change while losing the corresponding message. Redis cannot close this gap because enqueueing and a PostgreSQL commit are not one transaction.

## Decision

Every mutation with an asynchronous consequence writes an `OutboxMessage` in the same PostgreSQL transaction as the aggregate change. The same transaction materializes one `OutboxConsumerExecution` for every allowlisted consumer selected from the persisted event contract. The outbox row is the immutable delivery intent, consumer executions are the durable execution ledger, and BullMQ is transport only; PostgreSQL remains the source of truth.

An `OutboxConsumerExecution` contains the outbox message ID, consumer name, status, attempts/max attempts, availability, lock owner/time, start/heartbeat/completion timestamps, redacted terminal error, optional user-visible job reference, and a unique deduplication key. `(outbox_message_id, consumer_name)` is unique. Email, notification, activity and generated-artifact consumers retry independently; partial success never causes a completed consumer to run again.

BullMQ job IDs are deterministic functions of both identity dimensions: `<outboxMessageId>--<consumerName>`. Queue payloads contain only the outbox ID, consumer-execution ID, consumer name and contract version. Workspace, actor, correlation and job context are loaded from PostgreSQL and checked against the persisted execution/outbox relationship before any RLS context is set. A workspace identifier supplied only by Redis is never trusted.

`BackgroundJob` is reserved for work whose lifecycle is intentionally visible to the requesting user, currently activity export and onboarding completion. Internal email/projection executions do not create a user-visible job. When a visible job exists it summarizes the relevant consumer set, but it does not replace the per-consumer ledger.

The public event envelope contains a UUID, allowlisted event name and version, aggregate type/id, optional workspace and actor, correlation/idempotency keys, a redacted JSON payload and a unique logical deduplication key. Notification and activity consumers use their own dedupe keys derived from the source event. Projection lifecycle events (`notification.read.v1`, `notification.dismissed.v1`) never request notification/activity projection consumers, preventing recursion. Activity produced from semantic events and any matching audit source uses a canonical source-event/correlation dedupe key.

Authentication tokens and recipient details are never stored in the public payload or logs. A bounded command is encrypted in a versioned AES-256-GCM envelope containing `version`, `keyId`, `algorithm`, nonce, authentication tag, ciphertext, issued-at and expiry timestamps. The active key ID encrypts new commands; the worker keyring retains old keys until every envelope using them is terminal and its expiry window has elapsed. Expired envelopes fail permanently. Rotation activates a new ID first, deploys the decrypt keyring, waits through the retention window, then removes the old key.

The dispatcher claims consumer executions with `FOR UPDATE SKIP LOCKED` in a short transaction, creates or reuses the deterministic BullMQ job, and records enqueue state. If Redis is unavailable, the execution remains retryable in PostgreSQL. Reconciliation reclaims stale dispatcher/worker locks and enqueues nonterminal executions. An outbox becomes processed only after every required consumer is terminal-success; a required dead-letter is reflected durably without replaying successful siblings.

API success after an outbox-producing command means only that authoritative state and durable delivery intent committed. It never means SMTP or another external provider delivered the effect. Responses expose queued job state only for intentionally user-visible jobs, and frontend copy uses queued/processing language.

Delivery semantics are **at least once**. Database projections provide effectively-once effects through unique source/dedupe keys. External SMTP delivery cannot be universally exactly once: a provider can accept a message before the worker persists acknowledgement, after which recovery may resend it. Provider IDs and deterministic internal dedupe reduce this window but do not eliminate it.

## Consequences

- API success means authoritative data and the durable intent were committed together, not that the side effect already completed.
- Redis loss cannot lose a committed event; it only delays execution.
- Failed/dead-lettered internal work remains visible in `OutboxConsumerExecution` and `DeliveryAttempt`; only explicitly user-facing work appears as `BackgroundJob`.
- Producers must use the shared event factory inside their existing transaction; direct post-commit SMTP and arbitrary queue calls are prohibited.
- The outbox payload is deliberately small, redacted, versioned, and validated by shared Zod contracts.
- Crash tests cover failure before enqueue acknowledgement, after enqueue, during one consumer after a sibling succeeded, and after provider acceptance before internal acknowledgement.
