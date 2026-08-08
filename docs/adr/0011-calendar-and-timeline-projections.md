# ADR 0011: Calendar and timeline projections

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2B unified calendar, phases, milestones, timeline and recalculation

## Context

Tasks and milestones already carry planning dates. Persisting a second editable calendar row for every deadline would create duplicate authorities. Flexible wedding dates also require relative offsets to survive until an exact date is known.

## Decision

`CalendarEvent` stores only native, user-created events. The calendar query is a unified read model over native events, task start/due dates, milestone targets, and onboarding/wedding sub-events. Every item returns `sourceType`, `sourceId`, `editable` and a source navigation URL. Only `sourceType=native_event` can be mutated by Calendar API; projected items navigate to their source and are never duplicated.

`PlanningPhase` and `TimelineMilestone` are canonical timeline structures. `MISSED` is derived when a non-completed milestone target is in the past; it is not an arbitrary manual transition. Relative offsets are stored alongside nullable absolute timestamps. When the wedding date is exact, the engine materializes workspace-timezone timestamps and prevents pre-event tasks from landing after the wedding. Flexible dates retain readable relative offsets.

Timeline is a composed read model containing phases, milestones, task counts/progress, delays, dependency/critical indicators. Recalculation recomputes relative dates and reports proposed changes for manually edited deadlines instead of silently overwriting them. It emits `timeline.recalculated.v1` only for the committed recalculation state.

`GET /api/v1/workspaces/:workspaceId/calendar.ics` generates a bounded, timezone-aware, escaped iCalendar document from authorized visible items. External Google/Outlook synchronization remains planned and its UI disabled.

## Consequences

- A task deadline has one authority (`Task`) and one calendar projection.
- Calendar and timeline can be rebuilt from canonical rows.
- Relative planning remains useful before an exact wedding date exists.
- Native events remain independently editable without confusing projected task/milestone entries.
