# ADR 0039: Wedding Day Plan and Run of Show

Status: Accepted for Slice 8  
Date: 2026-07-20

## Context

WeddingOS already owns canonical wedding events, planning tasks, milestones, calendar events, vendor bookings and published operational snapshots. The day-of product needs a stable operational plan without mutating or copying those sources indiscriminately.

## Decision

`WeddingDayPlan` is the mutable lifecycle aggregate for one `WeddingEvent`. `WeddingDayPlanVersion` is an immutable, content-hashed snapshot. Publishing creates or selects an immutable version; going live pins `liveVersionId`. Later draft edits never alter the live version.

The explicit plan state machine is:

`DRAFT -> READY -> PUBLISHED -> LIVE <-> PAUSED -> COMPLETED -> ARCHIVED`.

Publishing and going live are separate, version-checked, idempotent commands. At most one plan per wedding event may be `LIVE` or `PAUSED`. A completed plan cannot go live again in Slice 8.

`RunOfShowItem` stores the operational schedule and optional canonical `sourceType/sourceId`. Runtime status, actual timestamps and delay information remain mutable, while planned content is associated with the pinned plan version. Dependencies support `FINISH_TO_START` and `START_TO_START`, reject self/cross-plan edges and cycles, and never auto-start downstream items.

Status is only changed by the state machine: `MARK_READY`, `START`, `MARK_DELAYED`, `BLOCK`, `UNBLOCK`, `COMPLETE`, `SKIP`, `CANCEL`, `REOPEN`. Required reasons and timestamps are server validated. Every command uses `If-Match`; creates, publishing and live commands use `Idempotency-Key`.

Operational contact and vendor details are snapshotted in plan versions so later profile changes cannot rewrite history. Checklists are event-scoped operational records and may reference a planning task, but do not duplicate the planning backlog.

## Consequences

PostgreSQL remains authoritative. Redis or the browser cannot advance the plan. Live responses always include server time and canonical versions. Semantic outbox events produce idempotent notification/activity/live projections without recursive projection events.
