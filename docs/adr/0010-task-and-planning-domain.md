# ADR 0010: Task and planning domain

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2B phases, tasks, subtasks, dependencies, comments, assignment, reminders, and exports

## Context

The frontend currently uses seed arrays and local state for Planning. Slice 2B needs one canonical tenant-isolated task aggregate that supports both generated and manual work without introducing future budget, guest, vendor, contract or file aggregates.

## Decision

`PlanningPhase` groups work. `Task` is the aggregate for both tasks and subtasks through `parentTaskId`; Slice 2B permits root plus one subtask level only. Assignment references an active `WorkspaceMembership`, never a display name. Task status changes are accepted only through the transition endpoint and the closed state machine; PATCH cannot mutate status.

Statuses are `NOT_STARTED`, `IN_PROGRESS`, `WAITING`, `BLOCKED`, `COMPLETED`, `ARCHIVED`. Priority is `LOW`, `MEDIUM`, `HIGH`, `URGENT`. BLOCK requires a reason, POSTPONE a date, COMPLETE checks unfinished dependencies, REOPEN clears completion metadata, and ARCHIVE remains reversible. Completing a parent with incomplete subtasks requires explicit confirmation; subtask completion alone never auto-completes the parent.

`TaskDependency` initially supports `FINISH_TO_START`. Replacement validates same workspace, active tasks, no self-reference and no directed cycle in one transaction. `TaskComment` stores bounded plain text; authors edit their own comments and users with planning moderation capability can moderate. Attachments stay absent and disabled.

`TaskReminder` is version-aware scheduled intent. `task_reminder` is an internal consumer, not a visible job. Before an in-app or e-mail effect it rechecks task existence/status/version, reminder state, recipient membership/access and schedule. A task mutation cancels or stales old reminders and creates a new deduped reminder when requested. Routine updates do not send e-mail.

All mutations use semantic events, outbox consumer executions, activity/notification projections as applicable, optimistic versions and idempotency for create/copy. Private tasks are visible to creator, active assignee, couple owners, or users with `task.read_private`; RLS is forced for every Slice 2B table.

Planning CSV export reuses user-visible `BackgroundJob` and `GeneratedArtifact`; no bytes enter job/outbox JSON. Task copy may include subtasks/dependencies and shift dates, but never copies comments, completion metadata, activity or expired reminders.

## Consequences

- List, board, drawer, dashboard, search, calendar and timeline read the same canonical tasks.
- State cannot diverge through arbitrary status PATCH or frontend-only drag/drop.
- The two-level subtask constraint keeps progress and deletion impact tractable in this slice.
- Future module links remain nullable metadata until their aggregates exist.
