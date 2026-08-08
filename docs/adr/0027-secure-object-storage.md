# ADR 0027: Secure object storage

- Status: Accepted
- Date: 2026-07-20
- Slice: 6

## Context

WeddingOS needs contract attachments, receipts, payment evidence and portfolio images. The existing `GeneratedArtifact` filesystem is bounded to generated exports and is not a general upload store. Public buckets, stable object URLs and trust in a browser-provided MIME type would expose sensitive wedding and vendor data.

## Decision

Binary data is stored in a private S3-compatible bucket through `ObjectStorageProvider`. Development uses MinIO; production uses the configured S3 adapter with server-side encryption required for sensitive purposes. Provider selection, endpoint, region, bucket and credentials are server-only environment values. Domain DTOs expose opaque upload/download contracts and never bucket names or object keys.

`FileUploadSession` authorizes one allowlisted purpose, tenant side, normalized file name, content-type set, size limit and expiry. The API returns a short-lived signed PUT target; completion verifies provider metadata, size and SHA-256 before committing durable delivery intent. `StoredObject` tracks upload, verification, quarantine, availability and deletion independently of a document.

The worker reloads object identity and tenant context from the persisted outbox execution, downloads with bounded size, detects MIME from magic bytes, validates extension/purpose and streams the bytes through clamd `INSTREAM`. Sensitive files fail closed: scanner errors keep the object in `VERIFYING`/quarantine and no signed download is issued. Clean portfolio images may receive a separate derivative object; the original remains private.

Signed downloads are issued only after document authorization, capability checks, clean scan state and access-event persistence. URLs expire after five minutes by default. Secure deletion is a state machine: revoke access, mark `DELETING`, provider delete, then mark `DELETED`; audit metadata remains.

## Consequences

- Upload completion is not availability; the UI reports `În verificare` until the worker confirms clean content.
- Storage is private and provider replaceable; MinIO is a development topology, not a domain dependency.
- Download and deletion failures remain recoverable and auditable.
- Multipart support is provider-level and can be enabled for files above the configured threshold without changing document identity.
