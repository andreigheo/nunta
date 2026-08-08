# ADR 0043: Wedding Day privacy and operational access

Status: Accepted for Slice 8  
Date: 2026-07-20

## Decision

All workspace-owned Slice 8 tables use forced PostgreSQL RLS. The API and worker continue to use non-owner roles and transaction-local context. Worker workspace identity is derived from persisted outbox/execution records, never from a BullMQ payload.

Capabilities are atomic across wedding-day, incident, announcement, check-in, guest-moment and gallery operations. Couple owners/partners receive all; planners receive operational capabilities; operational team access is explicit by override; family collaborators are limited read-only; guests use the separate token/grant scope and never membership capabilities.

Incident medical/security descriptions, private contacts, denial reasons, presence state, credential material, device authentication, offline manifests, originals and moderation notes are sensitive. Search, activity, notification and guest SSE payloads use safe summaries only. Normal QR scans do not create one activity/notification per guest; aggregate milestones are emitted instead.

All concurrency-sensitive mutations require `If-Match`, and all retriable creates/commands require `Idempotency-Key`. Audit and semantic activity are deduplicated by source event ID/correlation key. Projection events never emit themselves, preventing recursive loops.
