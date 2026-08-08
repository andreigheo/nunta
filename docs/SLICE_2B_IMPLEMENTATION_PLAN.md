# WeddingOS Slice 2B implementation plan

Date: 2026-07-18

## Verified pre-code baseline

- `pnpm verify`: exit 0; format, lint, typecheck, 28 unit, 17 integration and packages/API/worker/Next production builds passed; 0 failed, 0 skipped.
- Existing Playwright: 7/7 passed; 0 failed, 0 skipped.
- Prisma: 13 migrations found; `Database schema is up to date!`.
- PostgreSQL 17, Redis 7.4 and Mailpit are Docker-healthy; Redis returns `PONG` and Mailpit API 200.
- `weddingos-api`, `weddingos-worker`, `weddingos-web` are enabled/active; `/ready` is ready and `/sign-in` returns 200.
- Lockfile hashes were recorded before implementation and will be compared at handoff.

## Audit result

The current onboarding document has eight persisted/versioned sections and completion emits exactly one `onboarding.ready_for_plan_generation.v1`, but no consumer creates a plan. Production Planning, Calendar, Timeline and Overview import `src/lib/data/tasks.ts`/`wedding.ts`, keep page-local state, and contain toast-only/local success. Task modal/drawer, command palette and Quick Create use duplicate frontend-only task shapes and display names instead of membership IDs.

False/local actions in scope include generation/export/template claims, task CRUD/transitions/assignment/postpone/block/archive/delete, calendar create/export/sync, timeline recalculate/add/export/dependencies, Overview task completion/postpone/archive and seeded future-module metrics. Slice 2B replaces these for implemented planning resources; out-of-scope actions become disabled/planned.

The visual direction is fixed. Implementation reuses the existing shell, Cards, Tabs, Drawer, Modal, typography, tokens, spacing and responsive layout. No redesign, new palette or type system is introduced.

## Implemented entities

1. `PlanGenerationRun`: input/onboarding version, input hash, mode/provider/model/rules version, fallback/usage/error, status and proposal/job linkage.
2. `PlanProposal`: versioned review aggregate with assumptions, warnings, coverage, generator/provider metadata and apply/supersede lifecycle.
3. `PlanProposalItem`: ordered PHASE/MILESTONE/TASK tree with required/included, priority, absolute/relative dates, owner suggestion and metadata.
4. `PlanningPhase`: applied phase ordering, absolute/relative range, status and proposal provenance.
5. `TimelineMilestone`: applied/manual milestone with target/relative offset, status, ordering, soft delete and proposal provenance.
6. `Task`: canonical task/subtask aggregate with phase/milestone/parent, assignment membership, status, priority, dates/offsets, privacy, effort, source and soft delete.
7. `TaskDependency`: same-workspace FINISH_TO_START edge with unique pair, self/cycle validation.
8. `TaskComment`: bounded plain-text comment with author and soft delete.
9. `TaskReminder`: version-aware IN_APP/EMAIL scheduled intent with dedupe/status/cancel lifecycle.
10. `CalendarEvent`: native manual calendar event; task/milestone dates remain query projections.

No `Dashboard`, projected calendar row, budget, guest, vendor, contract, file or generic AI entity is added.

## Implemented migrations

1. `20260718220000_slice_2b_planning_core`: enums/tables/FKs/indexes/unique and check constraints; role-template capability defaults; app grants and forced RLS policies.
2. `20260718223000_slice_2b_worker_context_and_recovery`: worker grants/policies bound to persisted execution context and reminder claim/reconciliation support.
3. `20260718224500_slice_2b_derived_worker_events`: safe worker-derived semantic events without exposing unrestricted tenant writes.
4. `20260718225500_slice_2b_notification_quiet_hours`: persisted notification quiet-hour delivery context.
5. `20260718231000_slice_2b_reminder_recipient_contract`: security-definer recipient resolution constrained to the persisted reminder/execution context.

All are forward-only. The real database and disposable verification path apply all 18 migrations before handoff.

## API operations

### Generation and proposal

- `POST /api/v1/workspaces/:workspaceId/plan-generations`
- `GET /api/v1/workspaces/:workspaceId/plan-proposals`
- `GET /api/v1/workspaces/:workspaceId/plan-proposals/:proposalId`
- `PATCH /api/v1/workspaces/:workspaceId/plan-proposals/:proposalId`
- `POST /api/v1/workspaces/:workspaceId/plan-proposals/:proposalId/reject`
- `POST /api/v1/workspaces/:workspaceId/plan-proposals/:proposalId/apply`

### Tasks and subresources

- task list/create/get/update/delete/transition/copy;
- subtask create/update/delete;
- comment list/create/update/delete;
- dependency full replacement;
- planning CSV export.

### Calendar, timeline, dashboard and search

- native calendar list/create/get/update/delete plus `calendar.ics`;
- unified `GET calendar-events` includes projected task/milestone/onboarding items;
- `GET timeline`, milestone create/update/delete, timeline recalculation preview/commit;
- `GET dashboard` composed read model;
- `GET search` for implemented authorized resources.

All canonical routes use `/api/v1`. Mutation preconditions and idempotency follow the prompt exactly. Planned external sync/template/PDF/attachments/recurrence operations remain absent or visibly disabled.

## Events

The closed catalog adds:

```text
planning.plan_generation_requested.v1
planning.plan_proposal_ready.v1
planning.plan_proposal_updated.v1
planning.plan_proposal_rejected.v1
planning.plan_applied.v1
planning.export_requested.v1
task.created.v1
task.updated.v1
task.assigned.v1
task.status_changed.v1
task.due_date_changed.v1
task.deleted.v1
task.reminder_scheduled.v1
task.reminder_due.v1
calendar.event_created.v1
calendar.event_updated.v1
calendar.event_deleted.v1
timeline.milestone_created.v1
timeline.milestone_updated.v1
timeline.milestone_deleted.v1
timeline.recalculated.v1
```

One semantic event represents one authoritative mutation. Activity never consumes matching AuditEvent a second time.

## Consumers and jobs

- Existing: `event_ack`, `notification_projection`, `activity_projection`, `email`, `activity_export`.
- New closed consumers: `plan_generation`, `task_reminder`, `planning_export`.
- User-visible BackgroundJobs: plan generation and planning CSV export.
- Internal-only: task reminder and all notification/activity projections.
- BullMQ remains `weddingos-domain-events` with `domain-event.consumer.v1`; deterministic ID remains `<outboxMessageId>--<consumerName>`.
- Plan/reminder consumers resolve workspace/actor/job only from persisted execution/outbox records and use transaction-local worker RLS context.

## Permissions

Atomic capabilities:

```text
planning.read planning.write planning.generate planning.apply
task.read task.write task.assign task.delete task.read_private
calendar.read calendar.write
timeline.read timeline.write timeline.recalculate
```

- Couple Owner/Partner: all planning capabilities.
- Wedding Planner: planning read/write/generate/apply; task read/write/assign/delete; calendar read/write; timeline read/write/recalculate; no `task.read_private` by default.
- Family Collaborator: `planning.read`, `task.read`; write only by override.
- Viewer: read-only planning/task/calendar/timeline.

Every controller operation declares and enforces the smallest capability. RLS repeats tenant/privacy boundaries and remains forced.

## Frontend connection plan

- `/plan`: real empty/generating/failure/proposal-review/applied states; real list/board/calendar tabs and filters; task CRUD/transitions/drawer/subresources.
- `/calendar`: real month/week/agenda query, native event CRUD, projected source navigation, ICS download; external sync disabled.
- `/timeline`: real phases/milestones/progress/delays/dependencies/recalculation; AI review/PDF disabled.
- `/overview`: real dashboard only; future budget/guest/vendor/payment/risk modules explicitly unavailable and without mutating actions.
- Task modal/drawer: shared contract types and API, membership assignment, optimistic conflict rollback; Files/Ask AI disabled.
- Quick Create: only task and native calendar event enabled; all other kinds disabled/planned.
- Command palette: authorized search API in real mode, navigation/demo local behavior preserved.

Seed data remains available only while the exact demo cookie is active. Production must issue no planning success from local state.

## Test plan

### Unit

Deterministic coverage/date/flexible/progress rules, provider fallback/output validator, proposal edit/exclusion/apply mapping, task transition/subtask/dependency graph, next-best-action, calendar union/ICS escaping, timeline progress/recalculation, reminder staleness, capabilities and event/consumer contracts.

### Integration

At least the 20 scenarios named in the execution prompt: generation/outbox, deterministic/fallback/dedupe, atomic apply/replay, task CRUD/transitions/cycles/assignment/reminders, unified calendar/projection immutability, timeline/dashboard/search, RLS/worker isolation, export artifact and optimistic conflicts. PostgreSQL, Redis, BullMQ, worker and Mailpit are real; zero skipped.

### E2E

Twelve serial scenarios cover generation/apply, proposal edits, persistence, board transition, dependency blocking, calendar projection, timeline, dashboard, two-session conflict, tenant isolation, reminder notification and demo zero-mutation. Zero skipped is a hard gate.

## Exact implementation order

1. Freeze ADRs/plan; extend shared contracts/jobs/config and add deterministic engine unit tests.
2. Add Prisma models plus two forward migrations; apply, generate and prove app/worker RLS on a fresh database.
3. Add planning API module: proposal generation command/read/review/reject/apply and job contracts.
4. Add worker consumers: generation/fallback, reminders and bounded planning export.
5. Add task aggregate APIs, transitions, subtasks, assignment, dependencies, comments and copy.
6. Add native/unified calendar, ICS, timeline/milestones/recalculation, dashboard and search.
7. Complete OpenAPI contracts/tests for every active route.
8. Replace production mock/local state in Overview/Plan/Calendar/Timeline and connect shared task UI, Quick Create and command search without visual redesign.
9. Add unit/integration/E2E suites; run no-skip gate, builds, route smoke, OpenAPI and browser manual verification.
10. Reconcile all five registries, write `SLICE_2B_HANDOFF.md`, deploy migrations/build to persistent systemd services, restart-test worker and manually recheck readiness/browser.

## Scope guard

Slice 2B does not implement budgets, expenses, payments, Guest CRM, invitations/RSVP/seating/menus/transport/accommodation, marketplace/Vendor OS/RFQ/offers/bookings, contracts/files, moodboards, risks, wedding-day/media/post-wedding, general Copilot or AI outside plan enrichment. No Slice 3 work starts in this stage.

## Completion gate

`READY FOR SLICE 3` requires every acceptance item, 18/18 migrations, complete OpenAPI, forced RLS/worker isolation, real frontend persistence, no false success, no failed/skipped tests, persistent services and factual final handoff. Any unmet item is reported as condition or blocker, never hidden as future work.
