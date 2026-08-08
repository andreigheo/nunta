# ADR 0042: Guest Moments media and gallery

Status: Accepted for Slice 8  
Date: 2026-07-20

## Decision

Guest Moment creation requires a valid `GuestAccessGrant`. Uploads reuse secure upload sessions with three new purpose values: `GUEST_MOMENT_IMAGE`, `GUEST_MOMENT_VIDEO` and `WEDDING_DAY_INCIDENT_ATTACHMENT`.

Images are limited to JPEG/PNG/WebP and 20 MiB. Videos are limited to MP4/WebM and 100 MiB; Slice 8 extracts bounded metadata and a poster, but does not claim adaptive streaming. Originals remain private. ClamAV and deterministic media validation fail closed. A clean image derivative or video poster is generated into private object storage and sensitive metadata is stripped where supported.

Without a configured content-moderation provider, media becomes `PENDING_REVIEW`; the UI never labels it AI-approved. Only organizers with `guest_moment.moderate` may approve/reject/hide/restore. Only clean, approved derivatives can enter a published gallery. Storage object keys and raw originals never appear in public DTOs.

Gallery collections are access controlled (`GUESTS_WITH_ACCESS`, `HOUSEHOLDS`, `PRIVATE_ORGANIZERS`). Guest queries require a current grant and see only published authorized collections. Reports are durable, deduplicated moderation intake. Face recognition and a public social feed are explicitly out of scope.
