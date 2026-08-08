# Slice 2A implementation plan

Date: 2026-07-18

## Verified baseline

- `pnpm verify` passed before implementation: format, lint, TypeScript, 11 unit tests, 11 real PostgreSQL/Mailpit integration tests, API build, and a 52-page Next.js production build.
- PostgreSQL and Mailpit are healthy; the persistent API and web services were restarted and manually returned `200` from `/ready` and `/sign-in`.
- The API exposes 34 operations on 29 paths, but `components.schemas` is empty.
- Seven migrations exist. `DatabaseService.withContext()` correctly uses transaction-local user/workspace settings, but has no restricted worker/job context.
- Registration verification, verification resend, password reset, password-changed security mail, magic links, and invitation create/resend invoke SMTP after persistence.
- The notification drawer, activity export, onboarding completion, quick-create, copilot actions, settings export/access log, navigation badges, and several upload controls contain local or timed success behavior.
- No Redis, BullMQ, outbox, background-job model, worker process, delivery-attempt table, persistent notification/activity projection, or persistent onboarding draft exists.
- Git provenance is absent. No Git repository will be initialized and no lockfile will be deleted.

## Scope and file surface

Create the worker application, shared jobs package, async/API modules, Prisma migration, frontend API/error helpers, tests, operations assets, four ADRs, and the Slice 2A handoff. Modify root workspace scripts/dependencies, environment configuration, Compose, database schema/context/init role, API bootstrap/modules and transactional producers, shared contracts, the notification/activity/onboarding/shell surfaces, registries, README, CI, Playwright configuration, systemd assets, and `.gitignore`.

Slice 2A does not implement tasks, guests, finance, vendors, contracts, storage uploads, AI planning, or generated plans. Existing future-domain pages remain demos with mutating controls disabled.

## Mandatory final-gate decisions

The final hardening gate amends the original Slice 2A design as follows:

1. Every outbox event materializes durable, independently retryable `OutboxConsumerExecution` rows. BullMQ IDs combine outbox ID and consumer name.
2. Internal consumer executions are not user-visible `BackgroundJob` rows. Visible jobs are created only for activity export and onboarding completion.
3. Workspace notification routes are canonical under `/api/v1/workspaces/:workspaceId/notifications`; a future user-global security inbox may use `/api/v1/me/notifications` but is not added in this slice.
4. Activity export uses a managed `GeneratedArtifact` record, bounded local durable storage, owner-authorized download and explicit expiry/cleanup. CSV is never stored in job JSON or an unmanaged temporary path.
5. API success means authoritative state plus durable intent committed, not external delivery. UI copy must say queued/processing where relevant.
6. Worker tenant context is derived from joined persisted execution/outbox/job rows and checked before `SET LOCAL`; Redis workspace fields are not trusted.
7. Projection consumers are selected once from the source contract. Projection lifecycle events cannot recursively generate projections, and activity uses canonical source/correlation dedupe.
8. Encrypted commands use a versioned key-ID envelope with AES-256-GCM metadata, issued/expiry times and an old-key retention procedure.
9. Completion requires both `If-Match` and `Idempotency-Key`; a replay returns the same visible job and emits one readiness event without generating a plan.
10. Delivery is at-least-once. Database effects are effectively once where unique dedupe constraints apply; SMTP may duplicate after provider acceptance followed by a crash before acknowledgement.

## Migration and entities

The original Slice 2A migrations add the async enums and seven entities below; the final-gate forward-only hardening migration adds the per-consumer and generated-artifact structures and adjusts the original one-job-per-event relationship.

The final migration sequence contains 13 migrations. The three final-gate migrations are:

- `20260718155000_slice_2a_consumer_hardening`: per-consumer executions, visible-job separation, delivery linkage, activity dedupe, generated artifacts, forced RLS, persisted worker-context functions, claim/reconciliation, and artifact cleanup.
- `20260718175000_fix_consumer_reconciliation_uuid`: forward-only correction of the reconciliation aggregate for PostgreSQL UUID compatibility (`max(uuid)` is replaced by a text aggregate cast back to UUID).
- `20260718182000_serialize_consumer_reconciliation`: serializes reconciliation on the outbox row and repairs any pre-lock aggregate/job drift so simultaneous consumer commits cannot leave a completed job running.

1. `OutboxMessage`: durable versioned event envelope, dedupe, claim, retry, encryption header, and terminal state.
2. `OutboxConsumerExecution`: one durable execution per outbox+consumer with independent status, attempts, lock, heartbeat, completion, error, dedupe and optional visible-job reference.
3. `BackgroundJob`: persisted lifecycle only for intentionally user-visible work, progress, attempts, error/result, and cancellation/dead-letter metadata.
4. `DeliveryAttempt`: one redacted provider attempt per email try, linked to the consumer execution and optionally to a visible job.
5. `Notification`: recipient/workspace projection with read/dismiss state and source dedupe.
6. `ActivityItem`: workspace projection with actor/entity snapshots and canonical source/correlation dedupe.
7. `OnboardingDraft`: one versioned complete eight-step document per workspace.
8. `GeneratedArtifact`: managed export metadata including owner/workspace, storage key, format, size, checksum, status, expiry and deletion timestamps.
9. `WorkerHeartbeat`: liveness/capability metadata for readiness.

Indexes cover outbox identity/status, consumer availability/status/locks, visible-job owner/workspace/status/time, notification recipient/unread/time, activity workspace/time/category, delivery execution/attempt, artifact owner/expiry, and onboarding workspace uniqueness. Forced RLS is added for every user/tenant table. A non-owner `weddingos_worker` role receives the minimum grants and policies tied to transaction-local worker/execution/job/workspace settings.

## New modules and processes

- API: `AsyncModule`, `JobsModule`, `NotificationsModule`, `ActivityModule`, `OnboardingModule`, OpenAPI schema generator, and readiness dependencies.
- Worker: per-consumer dispatcher/reconciler, BullMQ processor, closed consumer registry, email handler, notification/activity handlers, managed activity-export handler, artifact cleanup, heartbeat, and graceful shutdown.
- Shared jobs: event/job Zod contracts, allowlist, transition machine, backoff/retry classification, AES-GCM envelope, and redaction.
- Frontend: notification/activity/onboarding API adapters, central problem policy, demo fail-closed client guard, and real job polling.

## API operations

- `GET/PATCH/POST /api/v1/workspaces/:workspaceId/onboarding` (read draft, save step/document with `If-Match`, complete without generating a plan).
- `GET /api/v1/jobs/:jobId`.
- `GET /api/v1/workspaces/:workspaceId/notifications`, `GET /api/v1/workspaces/:workspaceId/notifications/unread-count`, `POST /api/v1/workspaces/:workspaceId/notifications/mark-all-read`, and `PATCH/DELETE /api/v1/workspaces/:workspaceId/notifications/:notificationId`.
- `GET /api/v1/workspaces/:workspaceId/activity`, `POST /api/v1/workspaces/:workspaceId/activity-exports`.

All active operations receive concrete request/response/problem schemas, examples, statuses, cookie security, and required `Idempotency-Key`/`If-Match` headers where applicable. Planned registry operations remain absent; MFA stays visibly feature-flagged.

## Event and job contracts

Events keep the existing `*.v1` catalog and add `onboarding.draft_updated.v1`, `onboarding.ready_for_plan_generation.v1`, `notification.read.v1`, `notification.dismissed.v1`, and `activity.export_requested.v1`. Every envelope includes event/aggregate IDs, optional workspace/actor, occurred-at, correlation, dedupe, and a redacted payload. Producers attach only typed projection hints and encrypted email commands.

The only queue contract is `domain-event.consumer.v1` with `outboxMessageId`, `consumerExecutionId` and `consumerName`. BullMQ job ID is `<outboxMessageId>--<consumerName>`. Persisted rows provide workspace, actor, correlation and optional visible-job context; the queue cannot override them. Consumers are selected by a closed allowlist. Activity export is requested as a semantic event and executed as a typed managed-artifact handler; generated-plan jobs are explicitly absent.

`onboarding.ready_for_plan_generation.v1` selects notification and activity consumers only. It creates no plan, has no plan-generation consumer and reaches terminal success after those safe projections complete. `notification.read.v1` and `notification.dismissed.v1` select no user-visible projection consumer, so they cannot recurse.

## Integration and E2E test plan

The gate must assert scenarios, not only totals:

- producer rollback before commit leaves no outbox, consumer execution or visible job;
- crash/failure before BullMQ enqueue acknowledgement is reconciled from PostgreSQL;
- duplicate dispatch uses the deterministic outbox+consumer ID and produces one effect;
- worker crash/stale lock is reclaimed without replaying a completed sibling consumer;
- one consumer can complete while another retries/dead-letters, with accurate aggregate/job status;
- SMTP retry is persisted, and simulated provider acceptance before internal acknowledgement documents/observes possible at-least-once redelivery;
- forged queue workspace data cannot change persisted tenant context;
- pinned physical DB connections do not leak API or worker tenant context;
- onboarding stale/missing preconditions and idempotent completion emit one readiness event and no plan;
- managed CSV artifacts enforce owner access, size/row limits, checksum, expiry and cleanup;
- real-browser requests use same-origin `/api/v1`, while demo mode issues zero API network requests.

## Exact implementation order

1. Repository hygiene, environment contracts, Redis Compose, shared jobs package, and workspace scripts.
2. Prisma schema/migration, restricted role/policies, generation, migration, and RLS proof.
3. Transactional outbox producer and persisted job service; migrate every current SMTP flow into its transaction.
4. Worker dispatcher, BullMQ processor, retry/dead-letter/delivery attempts, projections, export, heartbeat, and shutdown.
5. Notification, activity, onboarding, and job APIs with authorization, pagination, idempotency, concurrency, and OpenAPI.
6. OpenAPI schema generation and contract coverage tests for all active routes.
7. Frontend demo guard and central 401/403/409 policy; replace notifications/activity/onboarding and disable global false actions without redesign.
8. Unit and real PostgreSQL/Redis/Mailpit integration tests, no skipped tests; provider-failure retry/dead-letter and RLS isolation proof.
9. Required browser journeys, source guard, build, route smoke, registry reconciliation, README/CI/ops/systemd, and final handoff.
10. Install/reload/enable the worker service, restart-test all persistent services, and manually verify API, worker, web, Redis, Mailpit, notifications/activity/onboarding, and OpenAPI.

## Implemented result and deviations

- Implemented topology matches the plan: root Next.js frontend, `apps/api`, `apps/worker`, and shared `contracts/config/database/jobs` packages. No Slice 2B plan generator, task/calendar/AI domain, generic job executor, upload system, or public API was added.
- The original one-outbox/one-visible-job implementation was replaced by `OutboxConsumerExecution`; historical rows were forward-backfilled into independently retryable consumer ledgers. Only activity export and onboarding completion retain `BackgroundJob` rows.
- The worker queue contract was renamed from the original `domain-event.process.v1` proposal to `domain-event.consumer.v1`; its deterministic identity includes both outbox and consumer.
- Notification item routes were moved from the temporary user-only path to the canonical workspace-scoped path. No `/api/v1/me/notifications` route was added.
- Activity export was not deferred: the managed `GeneratedArtifact` contract, bounded storage, secure owner download, checksum, expiry, and cleanup were implemented before enabling the asynchronous export.
- Browser transport was changed to same-origin `/api/v1` with a server-only Next.js rewrite. No browser-visible API origin is required.
- Onboarding completion returns a queued visible job and `planGeneration: not_started`; replays with either the same or a new idempotency key converge on the single readiness event/job and never create a generated plan.
- The final integration suite includes 17 non-skipped scenarios, including rollback, pinned RLS/forged workspace, lifecycle recursion suppression, stale dispatcher/worker recovery, partial consumer completion, provider-acknowledgement crash window, managed export lifecycle, and permanent dead-letter.
- A real integration run found PostgreSQL's lack of `max(uuid)` after consumer effects. The defect was fixed in a separate forward-only migration and the unchanged recovery tests then passed.
- A later concurrent-consumer run exposed an aggregate race in which all siblings completed but each reconciliation snapshot still saw another sibling uncommitted. Row-lock serialization plus a forward data repair closes that window.

## Risks and controls

- **Commit/dispatch gap:** PostgreSQL outbox plus reconciliation; Redis is transport only.
- **Duplicate processing:** deterministic job IDs and database unique dedupe keys.
- **Tenant leakage in worker pools:** restricted role, forced RLS, transaction-local context, and physical-connection tests.
- **Raw token/PII leakage:** redacted typed payload, encrypted command header, logger redaction, delivery metadata allowlist.
- **Provider outage:** classified bounded retry, persisted attempts, dead-letter state, and honest API/UI status.
- **Optimistic conflicts:** `If-Match` and visible reload/manual-retry UX; no silent overwrite.
- **Demo mutation:** mandatory pre-fetch cookie guard and zero-network E2E proof.
- **Mounted filesystem latency:** explicit Linux Node/temp paths and long but real validation timeouts.
- **No Git metadata:** no Git mutation; handoff records the operational limitation and keeps both lockfiles pending provenance.
- **Scope creep:** no future-domain tables/APIs, uploads, plan generation, or generic arbitrary job execution.

## Completion gate

The slice is complete only when migrations, restricted-role/RLS proofs, Redis, worker restart recovery, outbox atomicity, retry/dead-letter delivery evidence, real notification/activity/onboarding flows, OpenAPI schema coverage, demo zero-network isolation, all non-skipped unit/integration/E2E/build checks, and manual persistent-runtime smoke pass. A failed gate is reported as a blocker rather than relabeled as complete.
