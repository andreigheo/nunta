# ADR 0007: Notification, activity, and generated-artifact projections

- Status: accepted
- Date: 2026-07-18
- Scope: Slice 2A persistent user projections and activity export

## Context

The notification drawer and activity page previously rendered demo arrays, mutated local state, and claimed CSV success without a managed artifact. Durable projections must tolerate at-least-once processing, remain tenant-isolated, and avoid recursive notification/activity events.

## Decision

Versioned semantic events feed two tenant-aware read models:

- `Notification`: recipient, workspace, module/kind/priority, title/body, safe local action URL, read state, source event, and deduplication key.
- `ActivityItem`: workspace, actor snapshot, category/action, entity reference, redacted summary/metadata, source event, correlation, explicit deduplication key, and occurrence time.

Notification and activity consumers use unique keys derived from the source outbox event. Activity additionally records correlation/source identity so a semantic DomainEvent and matching AuditEvent can converge on the same explicit dedupe key instead of creating duplicate feed rows.

Workspace notification operations are canonical only below `/api/v1/workspaces/:workspaceId/notifications`, including item `PATCH` and `DELETE`. Membership/capability checks, owner filtering, and forced RLS all include the workspace. A future user-global security inbox may use `/api/v1/me/notifications`, but it is not part of Slice 2A.

Read and dismiss mutations atomically emit `notification.read.v1` and `notification.dismissed.v1`. These lifecycle events select only the internal `event_ack` consumer. They do not request notification, activity, or export projections, so they cannot recursively create a second user-visible notification/activity item. Projection handlers never emit their own source event.

Activity export creates a user-visible `BackgroundJob`, an `activity.export_requested.v1` outbox message, an `activity_export` consumer execution, and a `GeneratedArtifact`. The worker generates a formula-safe CSV bounded by configured row/byte limits, writes it atomically into managed durable storage under a UUID-only key, and persists media type, owner/workspace, file name, size, SHA-256, row count, readiness, expiry, and deletion state. Job JSON contains metadata and a secure download route, never the CSV payload.

`GET /api/v1/jobs/:jobId/artifact` requires authentication, visible-job ownership, a `READY` unexpired artifact, and a safe managed storage key. It streams the file with a server-controlled filename. A cleanup loop claims expired artifacts through a restricted database function, deletes the managed file, and marks the record `DELETED`. Unmanaged temporary files and indefinite retention are prohibited.

## Consequences

- Aggregate APIs stay focused while projections and export retry independently.
- Duplicate transport delivery cannot duplicate supported database effects.
- Projection lag is expected and UI surfaces loading/queued/retry states honestly.
- Export has a bounded, owner-authorized lifecycle rather than a large job payload or temporary-file shortcut.
- Future notification channels may consume the same event catalog without changing these Slice 2A routes.
