# ADR 0041: Check-in QR credentials and offline synchronization

Status: Accepted for Slice 8  
Date: 2026-07-20

## Decision

Check-in uses a dedicated opaque credential, never the Guest Companion token. Only SHA-256 token hashes are persisted. A QR contains an unstructured random token with no guest name, household ID, email, phone or event metadata.

Sessions, stations and registered devices form the authorization boundary. Device secrets are returned once, stored only as hashes, short lived and revocable. A scan validates credential status/expiry/event scope, guest membership, RSVP eligibility and current canonical check-in state. Organizer override requires `check_in.override` and a non-empty reason.

A unique guest/event record plus idempotency records makes online and offline races converge to one canonical check-in. Duplicate scans return the existing result and do not emit a second semantic side effect.

Offline mode downloads a signed, expiring `CheckInManifestSnapshot` limited to the session/event and registered device. It contains scoped IDs, display labels, eligibility, credential proofs, state and limited warning codes; it excludes notes, allergy detail, full contact data and unrelated guests. Offline commands have UUIDs and monotonic local sequences. A sync batch validates device/session/snapshot/sequence, is bounded, and returns accepted, duplicate, conflict and rejected results per command. Stale manifests conflict instead of overwriting state.

IndexedDB is an encrypted best-effort cache where browser facilities permit; logout/device revoke clears or invalidates it. The server timestamp and event log are authoritative.
