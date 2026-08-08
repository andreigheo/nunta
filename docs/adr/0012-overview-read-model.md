# ADR 0012: Overview read model

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2B dashboard, next-best-action, global search, and production data boundary

## Context

The current Overview mixes seed tasks, budget, guests, vendors, calendar, risks and activity. Persisting a `Dashboard` aggregate or returning fake zero-shaped future data would create a conflicting authority and false product claims.

## Decision

`GET /api/v1/workspaces/:workspaceId/dashboard` is a transactional read model over `Workspace/WeddingProfile`, canonical planning tasks/phases/milestones, unified calendar and persistent Activity. No Dashboard table is created.

Slice 2B returns real wedding/planning metrics, urgent tasks, upcoming dates, phases, recent activity and a rule-based next-best-action. It also returns explicit `unavailableModules` flags for budget, guests, vendors, payments and risks; it never returns seed values for them.

Next-best-action ordering is deterministic: urgent overdue, high overdue, blocking task, urgent due soon, high due soon, approaching milestone with incomplete work, then the first available task in the current phase. The result explains reason, deadline and impact; it has no AI confidence.

Global search queries only implemented, authorized sources: tasks, milestones, phases, native calendar events, active team members and static navigation/settings shortcuts. Results pass capability and private-task filters before leaving PostgreSQL. The command palette uses this API in real mode and stays local/zero-network in demo.

Production Overview removes future-module cards or renders them unavailable without false actions. Existing layout, typography, colors, spacing, responsive behavior and components remain unchanged; only data/loading/empty/error/conflict/progress states change.

## Consequences

- Overview cannot contradict canonical planning data.
- Future modules can extend the read model without backfilling a fake dashboard aggregate.
- Search and recommendations are explainable and authorization-aware.
- Demo remains isolated while production contains no seed planning metrics.
