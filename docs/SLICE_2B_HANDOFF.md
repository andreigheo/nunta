# WeddingOS Slice 2B handoff

Date: 2026-07-18  
Scope: plan generation, reviewed proposal, planning tasks, calendar, timeline and Overview  
Final verdict: **READY FOR SLICE 3**

## Executive result

Slice 2B implements the first authoritative WeddingOS planning flow:

```text
READY onboarding
→ explicit generation request
→ durable BackgroundJob and outbox consumer
→ structured versioned proposal
→ human review/edit/reject
→ explicit atomic apply
→ phases + milestones + tasks/dependencies
→ unified Calendar + Timeline + Overview
→ planning notifications and Activity
```

The existing Slice 2A infrastructure was extended, not replaced. PostgreSQL remains the durable source of truth, BullMQ remains transport, `OutboxConsumerExecution` remains the independently retryable consumer ledger, and worker tenant context is derived from persisted job/outbox records. Delivery is at-least-once with idempotent effects where supported.

No Slice 3 domain was implemented.

## Plan generation

- `DeterministicPlanProvider` always generates the minimum coverage without an external service.
- `ConfiguredAiPlanProvider` is optional and accessed only through `PlanGenerationProvider`.
- `auto` and `ai_enriched` fall back to the deterministic provider after an absent/failed configured provider.
- Fallback is persisted and displayed honestly; the UI does not claim AI success.
- The normalized onboarding input, input hash, onboarding version, rules/provider/model version, usage and safe error are recorded in `PlanGenerationRun`.
- The generator creates `PlanProposal` plus an ordered `PlanProposalItem` tree; it never creates authoritative tasks directly.
- Coverage validation protects essential categories. Missing details become assumptions, not invented vendors, costs, contracts, guests or payments.
- Exact dates materialize workspace-timezone deadlines; flexible dates retain relative offsets.
- Existing booked services suppress active “find supplier” work and produce follow-up/verification planning instead.
- Proposals support versioned edit, optional inclusion/exclusion, required-item confirmation/reason, manual item addition, reject and regeneration.
- Apply is one PostgreSQL transaction over phases, milestones, tasks/subtasks, dependencies, proposal status, audit and outbox.
- Apply replay returns the existing result and cannot duplicate applied entities.

## Database

### Slice 2B migrations

1. `20260718220000_slice_2b_planning_core`
2. `20260718223000_slice_2b_worker_context_and_recovery`
3. `20260718224500_slice_2b_derived_worker_events`
4. `20260718225500_slice_2b_notification_quiet_hours`
5. `20260718231000_slice_2b_reminder_recipient_contract`

Together with Slice 0/1 and 2A, the repository has 18 forward migrations.

### Persistent entities

- `PlanGenerationRun`
- `PlanProposal`
- `PlanProposalItem`
- `PlanningPhase`
- `TimelineMilestone`
- `Task` (root task and subtask through `parentTaskId`)
- `TaskDependency`
- `TaskComment`
- `TaskReminder`
- `CalendarEvent` (native events only)

`Dashboard`, calendar projections and Timeline aggregates are read models, not duplicate tables. `GeneratedArtifact` and `BackgroundJob` are reused for planning CSV exports.

### Integrity and tenant isolation

- Foreign keys, unique dedupe constraints, task self-dependency checks and task/reminder indexes are present.
- Directed dependency cycles are rejected by the domain transaction.
- Forced RLS applies to all tenant-scoped Slice 2B tables.
- Application and worker roles are separate; migration/owner credentials are not used at runtime.
- Worker functions validate the persisted execution, outbox, aggregate, workspace and actor relationship.
- Cross-workspace proposal/task/comment/dependency/calendar/timeline/search access is denied.
- A forged plan-generation workspace is dead-lettered with no cross-tenant write.

## Tasks

- Cursor-paginated/filterable/sortable server list and task get/create/update/delete.
- Status changes only through `START`, `WAIT`, `BLOCK`, `UNBLOCK`, `COMPLETE`, `REOPEN`, `ARCHIVE`, `POSTPONE` transitions.
- `BLOCK` requires a reason; `POSTPONE` requires a date; `COMPLETE` checks unfinished dependencies; `REOPEN` clears completion metadata.
- Root plus one subtask level is enforced. Parent completion with unfinished subtasks requires explicit confirmation.
- Assignee is an active `WorkspaceMembership`; changing it emits the assignment semantic event and notification intent.
- Private task visibility is enforced server-side and by RLS.
- Full dependency replacement validates same workspace, live tasks, no self-reference and no graph cycle, and returns impact.
- Comments are bounded plain text; authors edit their own content and authorized planners/owners can moderate.
- Copy can include subtasks/dependencies and shift dates, but does not copy comments, completion, activity or expired reminders.
- Reminders are version-safe, recipient/access-aware and deduped. Changed/completed/inaccessible tasks become stale no-ops.

## Calendar

- Native event CRUD is real and optimistic-version protected.
- The unified read returns native events, task start/deadline projections, milestone targets and onboarding/wedding events.
- Every item includes `sourceType`, `sourceId`, `editable` and a source URL.
- Projected tasks/milestones cannot be independently edited or duplicated as `CalendarEvent`.
- Opening a task projection navigates to `/plan?task=<id>` and opens the real task drawer.
- ICS export is authorized, bounded, escaped and timezone-aware.
- Google/Outlook synchronization remains disabled/planned.

## Timeline

- Real planning phases, milestones, task counts, progress, delayed flags, dependency/critical indicators.
- Milestone create/update/delete and complete/reopen are persistent.
- `MISSED` is derived from date/status.
- Recalculation reports relative-date proposals, overdue and blocked items without silently overwriting manual deadlines.
- PDF and general AI review remain disabled/planned.

## Overview and search

- `/dashboard` composes real wedding details, task metrics, urgent work, upcoming unified dates, phases and Activity.
- No `Dashboard` aggregate exists.
- Budget, guests, vendors, payments and risks are explicitly unavailable rather than mocked.
- Next-best-action is deterministic: urgent overdue, high overdue, blocking task, urgent/high due soon, approaching milestone, then first available phase task.
- The recommendation includes reason, deadline, impact and a real task link; no AI confidence is invented.
- Global search covers authorized tasks, milestones, phases, native events, active members and navigation/settings shortcuts.

## Events, consumers and jobs

Planning events are versioned and registered:

- `planning.plan_generation_requested.v1`
- `planning.plan_proposal_ready.v1`
- `planning.plan_proposal_updated.v1`
- `planning.plan_proposal_rejected.v1`
- `planning.plan_applied.v1`
- `planning.export_requested.v1`
- `task.created.v1`, `task.updated.v1`, `task.assigned.v1`, `task.status_changed.v1`, `task.due_date_changed.v1`, `task.deleted.v1`
- `task.reminder_scheduled.v1`, `task.reminder_due.v1`
- `calendar.event_created.v1`, `calendar.event_updated.v1`, `calendar.event_deleted.v1`
- `timeline.milestone_created.v1`, `timeline.milestone_updated.v1`, `timeline.milestone_deleted.v1`, `timeline.recalculated.v1`

New consumers are `plan_generation`, `task_reminder` and `planning_export`. Only plan generation and planning export create user-visible jobs. Projection/reminder executions remain internal. BullMQ job IDs remain deterministic per `<outboxMessageId>--<consumerName>`.

Recursive notification/activity loops are excluded. Activity is projected once from semantic events and does not duplicate the matching AuditEvent.

## Frontend

The existing layout, navigation, theme, typography, spacing, palette, responsiveness and UI primitives were preserved.

- `/plan`: structured proposal review, generation/fallback progress, apply preview/confirmation, real list/board/calendar/timeline task views, filters/sort/search, task modal and drawer actions.
- Board drag-and-drop executes a real versioned transition, rolls back on failure and surfaces conflict responses.
- Task drawer connects Overview, Subtasks, Comments and Activity; Files remains planned.
- `/calendar`: real Month/Week/Agenda, native event CRUD, projected navigation, source filters, period controls and ICS.
- `/timeline`: real phases/milestones/progress/delays/recalculation preview.
- `/overview`: canonical planning metrics and rule-based next action.
- Command palette uses authorized search.
- Quick Create enables only task and native calendar event.
- Planning CSV queues a real job, waits for completion and downloads the authorized `GeneratedArtifact`.
- Production has real empty/loading/error/conflict/job states and no planning seed data.
- Demo retains isolated local state and transport denies real `/api/v1` calls.

## OpenAPI and registries

- Active Slice 2B operations have concrete request/response/problem schemas, examples, cookie auth, capability metadata, `If-Match`, `Idempotency-Key`, status codes and cursor contracts where relevant.
- Swagger Parser validation and the zero-schema/zero-accidental-planned-operation tests are part of the gate.
- Reconciled: `API_OPERATION_REGISTRY.json`, `FRONTEND_INVENTORY.json`, `BACKEND_ENTITY_CATALOG.json`, `AUTOMATION_REGISTRY.json`, `PERMISSION_MATRIX.csv`.

## Verification

The final combined gate ran from the Linux runtime mirror using Node 22.22.3:

| Gate               | Result                                        |
| ------------------ | --------------------------------------------- |
| Format             | PASS                                          |
| Lint               | PASS                                          |
| Typecheck          | PASS                                          |
| Unit               | 37 passed / 0 failed / 0 skipped              |
| Integration        | 20 passed / 0 failed / 0 skipped              |
| E2E                | 19 passed / 0 failed / 0 skipped / 0 retries  |
| API build          | PASS                                          |
| Worker build       | PASS                                          |
| Frontend build     | PASS; 52 routes generated                     |
| Route smoke        | PASS; Overview, Plan, Calendar, Timeline      |
| OpenAPI validation | PASS; Swagger Parser and schema coverage gate |

The hard gate is `failed: 0`, `skipped: 0`.

The E2E count consists of the seven retained Slice 0/1/2A scenarios and all 12 mandatory Slice 2B scenarios. The production-service browser smoke used a newly registered and verified account, a READY onboarding workspace and a real persistent task. All four routes returned HTTP 200 on their canonical paths, the task drawer opened from its persistent resource and the browser emitted zero console/page errors.

Prisma reports 18 migrations found, no pending migrations and an up-to-date local PostgreSQL schema. PostgreSQL, Redis and Mailpit containers are healthy. The user services `weddingos-api`, `weddingos-worker` and `weddingos-web` are enabled and active on loopback. A forced termination test recreated all three processes with new PIDs; afterward `/ready` returned `database: connected`, `redis: connected`, `worker: healthy` and `outbox: dispatching`.

The persistent local entry point is `http://127.0.0.1:43191`; the API health endpoint is `http://127.0.0.1:4000/ready`.

## Limitations

### EXPECTED FOR NEXT SLICE

- Guest CRM, digital invitation, Guest Companion, RSVP and menus.
- Budget/expenses/payments, vendors/marketplace/RFQ/offers/bookings/contracts.
- External calendar sync, recurring tasks, task attachments and timeline PDF.
- General Copilot and AI outside bounded plan generation.

### TECHNICAL DEBT

- Historical per-control line numbers remain in `FRONTEND_INVENTORY.json`; the `slice2bReconciliation` block and current React source are authoritative after the functional rewrite.
- A configurable external plan provider needs production endpoint/key/provider contract configuration before it can be enabled; deterministic generation is fully functional without it.

### BLOCKER

- None in the implemented Slice 2B scope.

## Final verdict

`READY FOR SLICE 3`

Slice 3 was not started.
